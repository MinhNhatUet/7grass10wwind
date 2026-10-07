"""Demo các môn từ dữ liệu thật trong data/artifacts/<môn>/ (D-47; mặc định SE101 "Công nghệ phần mềm").

Chạy từ gốc repo:
    python scripts/seed_cnpm.py --confirm-demo-usage                    # chỉ SE101 (như trước)
    python scripts/seed_cnpm.py --confirm-demo-usage --course MATH101   # một/nhiều môn (lặp --course)
    python scripts/seed_cnpm.py --confirm-demo-usage --all-courses      # mọi thư mục môn trong data/artifacts

- Mỗi môn: data/artifacts/<môn>/{pdf,pptx,ppt}/ (file gốc) + chunks/ pages/ + inventory.jsonl, resolved_metadata.jsonl.
  Tên môn lấy từ thư mục gốc trong inventory (relative_path). File .ppt (app chỉ nhận pdf/pptx) dùng bản PDF đã đổi sẵn
  cùng tên trong pdf/ — đối chiếu metadata vẫn theo checksum file .ppt gốc.
- 3 tài khoản demo: sinh viên, giảng viên, quản trị — được cấp quyền ở mọi môn được nạp.
  login_id/mật khẩu đọc từ .env (DEMO_CNPM_*); thiếu thì tự sinh mật khẩu ngẫu nhiên và GHI vào .env (không in ra).
- kiemduyet01 (đã có) được thêm quyền duyệt SE101 để luồng HITL có người duyệt KHÁC người tải lên; quyền cũ giữ nguyên.
- PDF trong data/artifacts/se101/pdf được đối chiếu sha256 với data/artifacts/se101/inventory.jsonl, rồi đi đủ luồng
  giảng viên tải lên → gửi duyệt → kiểm duyệt duyệt → index → Published. File đã có (cùng checksum) thì bỏ qua.
- Quyền sử dụng trong metadata là "unknown": bắt buộc cờ --confirm-demo-usage (người chạy xác nhận dùng cho demo),
  ghi audit confirm_dev_usage cho từng bản.
- CHUNK lấy từ data/artifacts/se101/chunks (người dùng chọn): sau bước trích xuất, chunk của app được thay bằng chunk artifacts
  (bỏ khối "image_body" + 5 dòng toạ độ và dòng chân trang lặp); embedding chỉ chạy cho các chunk này ở bước index.
- --reset: gỡ các bản SE101 đã nạp trước đó (chỉ khi chưa có trích dẫn nào trỏ tới) rồi nạp lại.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from eval.common import REPO_ROOT, setup_console  # noqa: E402
from scripts.import_books import wait_job  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.ingestion.chunking.serializers import serialize_element  # noqa: E402
from src.ingestion.models.element import Element  # noqa: E402
from src.models.orm import (  # noqa: E402
    PUBLISHED,
    Approval,
    Chunk,
    Citation,
    Course,
    Document,
    DocumentVersion,
    IngestionJob,
    Membership,
    User,
)
from src.services import audit, documents  # noqa: E402
from src.services.auth import hash_password  # noqa: E402
from src.services.errors import AppError  # noqa: E402

COURSE_ID, COURSE_NAME = "SE101", "Công nghệ phần mềm"  # môn mặc định; --fill-page-map chỉ cho môn này
ART_ROOT = REPO_ROOT / "data" / "artifacts"  # artifacts chia theo môn: data/artifacts/<môn>/
ARTIFACTS = ART_ROOT / "se101"
ENV_FILE = REPO_ROOT / ".env"
ACCOUNTS = [  # (tên trong .env, login_id mặc định, vai trò, tên hiển thị)
    ("SINHVIEN", "sinhvien", "student", "Sinh viên CNPM"),
    ("GIANGVIEN", "giangvien", "lecturer", "Giảng viên CNPM"),
    ("ADMIN", "quantri", "admin", "Quản trị"),
]
PERMS = {
    "student": {"can_read": True, "can_download": False, "can_upload": False, "can_review": False},
    "lecturer": {"can_read": True, "can_download": True, "can_upload": True, "can_review": False},
    "reviewer": {"can_read": True, "can_download": True, "can_upload": True, "can_review": True},
}


def _credentials() -> dict[str, tuple[str, str]]:
    """login_id/mật khẩu từ .env; thiếu thì sinh và nối vào .env (không in mật khẩu)."""
    env = dotenv_values(ENV_FILE)
    out, new_lines = {}, []
    for key, default_login, _, _ in ACCOUNTS:
        lk, pk = f"DEMO_CNPM_{key}_LOGIN", f"DEMO_CNPM_{key}_PASSWORD"
        login, password = env.get(lk), env.get(pk)
        if not login:
            login = default_login
            new_lines.append(f"{lk}={login}")
        if not password:
            password = secrets.token_urlsafe(12)
            new_lines.append(f"{pk}={password}")
        out[key] = (login, password)
    if new_lines:
        text = ENV_FILE.read_text(encoding="utf-8")
        sep = "" if text.endswith("\n") else "\n"
        ENV_FILE.write_text(
            text + sep + "# Demo môn CNPM (scripts/seed_cnpm.py)\n" + "\n".join(new_lines) + "\n", encoding="utf-8"
        )
    return out


# MinerU: ảnh → "image_body" + số thứ tự + 4 toạ độ bbox; chân trang slide lặp lại ở mọi trang
_IMAGE_BLOCK = re.compile(r"^image_body\n\d+\n(?:[01](?:\.\d+)?\n){3}[01](?:\.\d+)?$\n?", re.M)
_FOOTER = re.compile(r"^Bộ môn Công nghệ phần mềm - Khoa CNTT - Trường ĐHCN - ĐHQGHN$\n?", re.M)


def _clean(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", _FOOTER.sub("", _IMAGE_BLOCK.sub("", text))).strip()


def _artifact_element_text(element: dict | None) -> str:
    if not element:
        return ""
    try:
        return _clean(serialize_element(Element.model_validate(element)))
    except (TypeError, ValueError):
        return _clean(str(element.get("text") or ""))


def _artifact_chunks(version_id: str, art: Path = ARTIFACTS) -> tuple[list[dict], int]:
    """Chunk artifacts GIỮ NGUYÊN (1 chunk = 1 embedding — D-49) + page_map [[vị trí ký tự, trang], …] dựng từ
    page_number của từng phần tử (data/artifacts/<môn>/pages), để trích dẫn mở đúng trang mà không phải embedding theo trang.
    Text = text các phần tử theo đúng thứ tự artifacts, bỏ hình (artifacts ghi "image_body" + toạ độ) và chân trang lặp.
    Trả (chunks, số trang)."""
    path, pages_path = art / "chunks" / f"{version_id}.json", art / "pages" / f"{version_id}.json"
    if not path.is_file() or not pages_path.is_file():
        return [], 0
    pages = json.loads(pages_path.read_text(encoding="utf-8"))
    elements = {e["id"]: e for p in pages for e in p["elements"]}
    out = []
    for c in json.loads(path.read_text(encoding="utf-8")):
        text, page_map, cursor = _clean(str(c.get("text") or "")), [], 0
        for eid in c["element_ids"]:
            e = elements.get(eid)
            part = _artifact_element_text(e)
            if not part:
                continue
            position = text.find(part, cursor)
            if position < 0:
                continue
            page = int(e["page_number"])
            if not page_map or page_map[-1][1] != page:
                page_map.append([position, page])
            cursor = position + len(part)
        if not page_map:
            locator = c.get("locator") or {}
            page_map = [[0, int(locator.get("start") or locator.get("number") or 1)]]
        else:
            page_map[0][0] = 0
        if len(text) >= 20:
            out.append(
                {
                    "page": page_map[0][1],
                    "section": c.get("section"),
                    "text": text,
                    "page_map": page_map,
                }
            )
    return out, len(pages)


def fill_page_map(db) -> tuple[int, int]:  # noqa: ANN001
    """Dựng page_map cho chunk SE101 ĐÃ có (không embedding lại — D-49): dò lần lượt text từng phần tử artifacts
    (theo thứ tự, có page_number) trong text chunk; phần tử đầu tiên tìm thấy của mỗi trang đánh dấu vị trí bắt đầu."""
    artifact_version = {
        r["version"]["checksum"]: r["version"]["id"]
        for r in (
            json.loads(x) for x in (ARTIFACTS / "resolved_metadata.jsonl").read_text(encoding="utf-8").splitlines()
        )
    }
    done = total = 0
    rows = db.execute(select(DocumentVersion).join(Document).where(Document.course_id == COURSE_ID)).scalars().all()
    for v in rows:
        vid = artifact_version.get(v.checksum)
        pages_path = ARTIFACTS / "pages" / f"{vid}.json"
        if not vid or not pages_path.is_file():
            continue
        elements = {e["id"]: e for p in json.loads(pages_path.read_text(encoding="utf-8")) for e in p["elements"]}
        art = json.loads((ARTIFACTS / "chunks" / f"{vid}.json").read_text(encoding="utf-8"))
        for ch in db.scalars(select(Chunk).where(Chunk.version_id == v.id)):
            total += 1
            best: list[list[int]] = []
            for c in art:  # chunk artifacts khớp nhất = dò được nhiều phần tử nhất
                cursor, page_map = 0, []
                for eid in c["element_ids"]:
                    e = elements.get(eid)
                    part = _artifact_element_text(e)
                    pos = ch.text.find(part, cursor) if len(part) >= 3 else -1
                    if pos < 0:
                        continue
                    if not page_map or page_map[-1][1] != int(e["page_number"]):
                        page_map.append([pos, int(e["page_number"])])
                    cursor = pos + len(part)
                if cursor > (best[-1][0] if best else -1) and len(page_map) >= len(best):
                    best = page_map
            if best:
                best[0][0] = 0
                ch.page_map, ch.locator_value = best, best[0][1]
                done += 1
    db.commit()
    return done, total


def _reset(db, course_id: str = COURSE_ID) -> int:  # noqa: ANN001
    """Gỡ các bản của môn đã nạp (không xoá file trong storage — kho theo nội dung có thể dùng chung)."""
    versions = list(db.scalars(select(DocumentVersion.id).join(Document).where(Document.course_id == course_id)))
    if not versions:
        return 0
    if db.scalar(select(Citation.id).where(Citation.version_id.in_(versions)).limit(1)):
        raise SystemExit(f"Đã có trích dẫn trỏ tới tài liệu {course_id} — không gỡ tự động.")
    for model in (Chunk, IngestionJob, Approval):
        db.execute(delete(model).where(model.version_id.in_(versions)))
    db.execute(delete(DocumentVersion).where(DocumentVersion.id.in_(versions)))
    db.execute(delete(Document).where(Document.course_id == course_id))
    audit.record(db, actor_id=None, action="reset_course_documents", object_type="course", object_id=course_id,
                 course_id=course_id, reason="seed_cnpm --reset: thay bằng chunk artifacts (D-47)")  # fmt: skip
    db.commit()
    return len(versions)


def _membership(db, user: User, role: str, course_id: str = COURSE_ID) -> None:  # noqa: ANN001
    m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.course_id == course_id))
    if m is None:
        db.add(Membership(user_id=user.id, course_id=course_id, **PERMS[role]))


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def _course_dirs(wanted: list[str] | None, all_courses: bool) -> list[Path]:
    """Thư mục môn cần nạp: --all-courses → mọi data/artifacts/<môn>/ có inventory; --course X → đúng các môn đó."""
    if all_courses:
        return sorted(d for d in ART_ROOT.iterdir() if (d / "inventory.jsonl").is_file())
    dirs = [ART_ROOT / c.lower() for c in (wanted or [COURSE_ID])]
    missing = [str(d) for d in dirs if not (d / "inventory.jsonl").is_file()]
    if missing:
        raise SystemExit(f"Không có inventory.jsonl: {missing}")
    return dirs


def _sources(art: Path, inventory: dict[str, dict]) -> list[tuple[Path, str, dict]]:
    """(file để tải lên, sha256 file GỐC, dòng inventory) — mọi file gốc trong pdf/ pptx/ ppt/ khớp inventory.
    .ppt/.pptx: tải lên bản PDF cùng tên trong pdf/ (đổi sẵn bằng PowerPoint — app vẽ được trang PDF thành ảnh, slide
    thì không; .ppt app không nhận), metadata vẫn ghép theo checksum file gốc. .pptx chưa có bản PDF → tải pptx."""
    out = []
    for sub in ("pdf", "pptx", "ppt"):
        for path in sorted((art / sub).glob("*")) if (art / sub).is_dir() else []:
            sha = hashlib.sha256(path.read_bytes()).hexdigest()
            inv = inventory.get(sha)
            if inv is None:
                converted = any((art / s / f"{path.stem}.{s}").is_file() for s in ("ppt", "pptx"))
                if not (sub == "pdf" and converted):  # bản PDF đổi từ slide: xử lý ở ppt/ hoặc pptx/
                    print(f"- {path.name}: không khớp checksum nào trong inventory.jsonl, bỏ qua")
                continue
            pdf = art / "pdf" / f"{path.stem}.pdf"
            upload = pdf if sub in ("ppt", "pptx") and pdf.is_file() else path
            if upload.suffix.lower() == ".ppt":
                print(f"- {path.name}: .ppt chưa có bản PDF trong pdf/, bỏ qua")
                continue
            out.append((upload, sha, inv))
    return out


MANIFEST = REPO_ROOT / "data" / "manifest.cnpm.json"


def write_manifest(db) -> int:  # noqa: ANN001
    """data/manifest.cnpm.json cho eval / seed_users / import_books (D-48): MỌI môn có thư mục data/artifacts/<môn>/ +
    các bản đang có trong DB. Bản tải lên là PDF đổi từ ppt/pptx (checksum khác file gốc) → ghép inventory theo tên."""
    courses, sources = [], []
    for course in db.scalars(select(Course).order_by(Course.id)):
        art = ART_ROOT / course.id.lower()
        if not (art / "inventory.jsonl").is_file():
            continue
        inv_rows = _jsonl(art / "inventory.jsonl")
        by_sha = {i["sha256"]: i for i in inv_rows}
        by_stem = {Path(i["filename"]).stem: i for i in inv_rows}
        rows = db.execute(
            select(DocumentVersion, Document)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(Document.course_id == course.id)
        ).all()
        if not rows:
            continue
        courses.append({"course_id": course.id, "name": course.name, "status": "confirmed"})
        rel = art.relative_to(REPO_ROOT).as_posix()
        for v, d in sorted(rows, key=lambda r: r[1].title):
            inv = by_sha.get(v.checksum) or by_stem.get(Path(v.original_filename).stem, {})
            sources.append({
                "source_id": d.id, "course_id": course.id, "title": d.title, "authors": None, "url": None,
                "license": f"Bài giảng nội bộ — quyền gốc 'unknown' ({rel}), xác nhận dùng cho demo (D-47)",
                "license_checked": False, "file_type": "pdf_text",
                "storage_ref": f"{rel}/pdf/{v.original_filename}", "page_count": v.page_count,
                "sha256": v.checksum, "version": v.version_label, "usage_permission": "allowed",
                "ai_processing_allowed": True, "confirmed_by": "Ngô Đinh Minh Nhật (TV1) — demo",
                "confirmed_at": "2026-10-01", "owner": "giangvien", "is_graded_material": False,
                "acl": {"roles": ["student", "lecturer", "reviewer"]}, "artifact_path": inv.get("relative_path"),
            })  # fmt: skip
    data = {"manifest_version": "cnpm-1", "status": "demo", "courses": courses, "sources": sources}
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(sources)


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(
        description="Demo các môn từ artifacts: môn, 3 tài khoản, nạp tài liệu qua luồng duyệt."
    )
    parser.add_argument(
        "--confirm-demo-usage", action="store_true", help="xác nhận dùng slide bài giảng cho demo (bắt buộc)"
    )
    parser.add_argument("--timeout", type=int, default=3000)
    parser.add_argument("--reset", action="store_true", help="gỡ bản đã nạp của các môn được chọn rồi nạp lại")
    parser.add_argument("--course", action="append", help="mã môn (vd MATH101); lặp để chọn nhiều; mặc định SE101")
    parser.add_argument("--all-courses", action="store_true", help="nạp mọi môn có trong data/artifacts/<môn>/")
    parser.add_argument("--manifest-only", action="store_true", help="chỉ ghi lại data/manifest.cnpm.json từ DB")
    parser.add_argument("--fill-page-map", action="store_true", help="dựng page_map cho chunk đã có (không embedding)")
    args = parser.parse_args(argv)
    if args.fill_page_map:
        init_db()
        db = get_sessionmaker()()
        try:
            done, total = fill_page_map(db)
            print(f"Đã dựng page_map cho {done}/{total} chunk SE101 (không embedding lại).")
        finally:
            db.close()
        return 0
    if args.manifest_only:
        init_db()
        db = get_sessionmaker()()
        try:
            print(f"Đã ghi {MANIFEST.relative_to(REPO_ROOT)} ({write_manifest(db)} nguồn).")
        finally:
            db.close()
        return 0
    if not args.confirm_demo_usage:
        print("Cần --confirm-demo-usage: metadata ghi quyền sử dụng 'unknown' (BR-01).")
        return 2

    creds = _credentials()
    course_dirs = _course_dirs(args.course, args.all_courses)
    init_db()
    db = get_sessionmaker()()
    try:
        users: dict[str, User] = {}
        for key, _, role, display in ACCOUNTS:
            login, password = creds[key]
            user = db.scalar(select(User).where(User.login_id == login))
            if user is None:
                user = User(id=f"u_cnpm_{key.lower()}", login_id=login, display_name=display, role=role,
                            password_hash=hash_password(password))  # fmt: skip
                db.add(user)
            else:
                user.role, user.status, user.display_name = role, "active", display
                user.password_hash = hash_password(password)
            db.flush()
            audit.record(db, actor_id=None, action="seed_user", object_type="user", object_id=user.id,
                         reason="seed_cnpm (D-47)")  # fmt: skip
            users[key] = user
        reviewer = db.scalar(select(User).where(User.login_id == dotenv_values(ENV_FILE).get("DEMO_KIEMDUYET01_LOGIN")))
        if reviewer is None or reviewer.role != "reviewer":
            print("Thiếu tài khoản kiemduyet01 (reviewer) — chạy scripts/seed_users.py --fixtures demo trước.")
            return 1
        db.commit()
        print("3 tài khoản demo (mật khẩu trong .env: DEMO_CNPM_*) + kiemduyet01 duyệt.")
        uploader = users["GIANGVIEN"]

        for art in course_dirs:
            inventory = {i["sha256"]: i for i in _jsonl(art / "inventory.jsonl")}
            course_id = next(iter(inventory.values()))["course_id"]
            name = next(iter(inventory.values()))["relative_path"].replace("\\", "/").split("/")[0]
            course = db.get(Course, course_id) or Course(id=course_id, name=name)
            course.name, course.status = name, "active"
            db.merge(course)
            db.flush()
            for key, _, role, _ in ACCOUNTS:
                if role in PERMS:
                    _membership(db, users[key], role, course_id)
            _membership(db, reviewer, "reviewer", course_id)
            db.commit()
            print(f"\n== Môn {course_id} — {name} ({art.relative_to(REPO_ROOT)})")
            if args.reset:
                print(f"Đã gỡ {_reset(db, course_id)} bản {course_id} cũ.")
            artifact_version = {
                r["version"]["checksum"]: r["version"]["id"] for r in _jsonl(art / "resolved_metadata.jsonl")
            }
            for path, sha, inv in _sources(art, inventory):
                data = path.read_bytes()
                if db.scalar(
                    select(DocumentVersion).where(DocumentVersion.checksum == hashlib.sha256(data).hexdigest())
                ):
                    print(f"- {path.name}: đã có, bỏ qua")
                    continue
                chunks, page_count = _artifact_chunks(artifact_version.get(sha, ""), art)
                if not chunks:
                    print(f"- {path.name}: không có chunk trong artifacts, bỏ qua")
                    continue
                print(f"- {path.name}: {len(chunks)} chunk artifacts ({page_count} trang)")
                converted = "" if path.name == inv["filename"] else f"; tải lên bản PDF đổi từ {inv['filename']}"
                meta = documents.VersionMeta(
                    title=path.stem, doc_type="slide", version_label="1",
                    provenance=f"Bài giảng môn {name} · {art.relative_to(REPO_ROOT).as_posix()}/inventory.jsonl "
                    f"({inv['relative_path']}{converted})",
                    usage_permission="confirmed", acl_roles=["student", "lecturer", "reviewer"], download_allowed=False,
                    integrity_label="learning_material",
                )  # fmt: skip
                try:
                    version = documents.import_prechunked(
                        db, uploader, course_id, data, path.name, meta, page_count, chunks,
                        source=f"{art.relative_to(REPO_ROOT).as_posix()}/chunks/{artifact_version.get(sha)}.json",
                    )  # fmt: skip
                    audit.record(db, actor_id=None, action="confirm_dev_usage", object_type="version",
                                 object_id=version.id, course_id=course_id,
                                 reason=f"seed_cnpm --confirm-demo-usage (D-47: demo môn {name})")  # fmt: skip
                    db.commit()
                    documents.submit(db, uploader, version.id, acknowledge_warnings=True)
                    _, index_job = documents.decide(db, reviewer, version.id, "approve", f"Demo môn {name}",
                                                    version.revision)  # fmt: skip
                    index_job = wait_job(db, index_job.id, args.timeout)
                    db.refresh(version)
                    print(f"    index: {index_job.status} {index_job.error_code or ''} → {version.state}")
                    if version.state != PUBLISHED:
                        print("    ⚠️ chưa Published — retry: POST /api/v1/versions/{id}/retry")
                except AppError as e:
                    db.rollback()
                    print(f"    lỗi: {e.code} {e.message or ''}")
        print(f"Đã ghi {MANIFEST.relative_to(REPO_ROOT)} ({write_manifest(db)} nguồn).")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
