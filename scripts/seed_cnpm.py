"""Demo môn Công nghệ phần mềm (SE101) từ dữ liệu thật trong data/artifacts (D-47).

Chạy từ gốc repo:
    python scripts/seed_cnpm.py --confirm-demo-usage

- Môn SE101 "Công nghệ phần mềm"; 3 tài khoản demo: sinh viên, giảng viên, quản trị.
  login_id/mật khẩu đọc từ .env (DEMO_CNPM_*); thiếu thì tự sinh mật khẩu ngẫu nhiên và GHI vào .env (không in ra).
- kiemduyet01 (đã có) được thêm quyền duyệt SE101 để luồng HITL có người duyệt KHÁC người tải lên; quyền cũ giữ nguyên.
- PDF trong data/artifacts/pdf được đối chiếu sha256 với data/artifacts/inventory.jsonl, rồi đi đủ luồng
  giảng viên tải lên → gửi duyệt → kiểm duyệt duyệt → index → Published. File đã có (cùng checksum) thì bỏ qua.
- Quyền sử dụng trong metadata là "unknown": bắt buộc cờ --confirm-demo-usage (người chạy xác nhận dùng cho demo),
  ghi audit confirm_dev_usage cho từng bản.
- CHUNK lấy từ data/artifacts/chunks (người dùng chọn): sau bước trích xuất, chunk của app được thay bằng chunk artifacts
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

COURSE_ID, COURSE_NAME = "SE101", "Công nghệ phần mềm"
ARTIFACTS = REPO_ROOT / "data" / "artifacts"
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


def _artifact_chunks(version_id: str) -> tuple[list[dict], int]:
    """Chunk artifacts GIỮ NGUYÊN (1 chunk = 1 embedding — D-49) + page_map [[vị trí ký tự, trang], …] dựng từ
    page_number của từng phần tử (data/artifacts/pages), để trích dẫn mở đúng trang mà không phải embedding theo trang.
    Text = text các phần tử theo đúng thứ tự artifacts, bỏ hình (artifacts ghi "image_body" + toạ độ) và chân trang lặp.
    Trả (chunks, số trang)."""
    path, pages_path = ARTIFACTS / "chunks" / f"{version_id}.json", ARTIFACTS / "pages" / f"{version_id}.json"
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


def _reset(db) -> int:  # noqa: ANN001
    """Gỡ các bản SE101 đã nạp (không xoá file trong storage — kho theo nội dung có thể dùng chung)."""
    versions = list(db.scalars(select(DocumentVersion.id).join(Document).where(Document.course_id == COURSE_ID)))
    if not versions:
        return 0
    if db.scalar(select(Citation.id).where(Citation.version_id.in_(versions)).limit(1)):
        raise SystemExit("Đã có trích dẫn trỏ tới tài liệu SE101 — không gỡ tự động.")
    for model in (Chunk, IngestionJob, Approval):
        db.execute(delete(model).where(model.version_id.in_(versions)))
    db.execute(delete(DocumentVersion).where(DocumentVersion.id.in_(versions)))
    db.execute(delete(Document).where(Document.course_id == COURSE_ID))
    audit.record(db, actor_id=None, action="reset_course_documents", object_type="course", object_id=COURSE_ID,
                 course_id=COURSE_ID, reason="seed_cnpm --reset: thay bằng chunk artifacts (D-47)")  # fmt: skip
    db.commit()
    return len(versions)


def _membership(db, user: User, role: str) -> None:  # noqa: ANN001
    m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.course_id == COURSE_ID))
    if m is None:
        db.add(Membership(user_id=user.id, course_id=COURSE_ID, **PERMS[role]))


MANIFEST = REPO_ROOT / "data" / "manifest.cnpm.json"


def write_manifest(db) -> int:  # noqa: ANN001
    """data/manifest.cnpm.json cho eval / seed_users / import_books (D-48): môn SE101 + các bản đang có trong DB."""
    inventory = {
        i["sha256"]: i
        for i in (json.loads(x) for x in (ARTIFACTS / "inventory.jsonl").read_text(encoding="utf-8").splitlines())
    }
    rows = db.execute(
        select(DocumentVersion, Document)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(Document.course_id == COURSE_ID)
    ).all()
    sources = []
    for v, d in sorted(rows, key=lambda r: r[1].title):
        inv = inventory.get(v.checksum, {})
        sources.append({
            "source_id": d.id, "course_id": COURSE_ID, "title": d.title, "authors": None, "url": None,
            "license": "Bài giảng nội bộ — quyền gốc 'unknown' (data/artifacts), xác nhận dùng cho demo (D-47)",
            "license_checked": False, "file_type": "pdf_text",
            "storage_ref": f"data/artifacts/pdf/{v.original_filename}", "page_count": v.page_count,
            "sha256": v.checksum, "version": v.version_label, "usage_permission": "allowed",
            "ai_processing_allowed": True, "confirmed_by": "Ngô Đinh Minh Nhật (TV1) — demo",
            "confirmed_at": "2026-10-01", "owner": "giangvien", "is_graded_material": False,
            "acl": {"roles": ["student", "lecturer", "reviewer"]}, "artifact_path": inv.get("relative_path"),
        })  # fmt: skip
    data = {
        "manifest_version": "cnpm-1", "status": "demo",
        "courses": [{"course_id": COURSE_ID, "name": COURSE_NAME, "status": "confirmed"}], "sources": sources,
    }  # fmt: skip
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(sources)


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Demo môn CNPM: môn, 3 tài khoản, nạp PDF qua luồng duyệt.")
    parser.add_argument(
        "--confirm-demo-usage", action="store_true", help="xác nhận dùng slide CNPM cho demo (bắt buộc)"
    )
    parser.add_argument("--timeout", type=int, default=3000)
    parser.add_argument("--reset", action="store_true", help="gỡ bản SE101 đã nạp rồi nạp lại")
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
    inventory = {
        i["sha256"]: i
        for i in (json.loads(line) for line in (ARTIFACTS / "inventory.jsonl").read_text(encoding="utf-8").splitlines())
        if i["course_id"] == COURSE_ID
    }

    init_db()
    db = get_sessionmaker()()
    try:
        course = db.get(Course, COURSE_ID) or Course(id=COURSE_ID, name=COURSE_NAME)
        course.name, course.status = COURSE_NAME, "active"
        db.merge(course)
        db.flush()

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
            if role in PERMS:
                _membership(db, user, role)
            audit.record(db, actor_id=None, action="seed_user", object_type="user", object_id=user.id,
                         course_id=COURSE_ID, reason="seed_cnpm (D-47)")  # fmt: skip
            users[key] = user
        reviewer = db.scalar(select(User).where(User.login_id == dotenv_values(ENV_FILE).get("DEMO_KIEMDUYET01_LOGIN")))
        if reviewer is None or reviewer.role != "reviewer":
            print("Thiếu tài khoản kiemduyet01 (reviewer) — chạy scripts/seed_users.py --fixtures demo trước.")
            return 1
        _membership(db, reviewer, "reviewer")
        db.commit()
        print(f"Môn {COURSE_ID} + 3 tài khoản demo (mật khẩu trong .env: DEMO_CNPM_*).")

        if args.reset:
            print(f"Đã gỡ {_reset(db)} bản SE101 cũ.")
        artifact_version = {
            r["version"]["checksum"]: r["version"]["id"]
            for r in (
                json.loads(x) for x in (ARTIFACTS / "resolved_metadata.jsonl").read_text(encoding="utf-8").splitlines()
            )
        }
        uploader = users["GIANGVIEN"]
        pdfs = sorted((ARTIFACTS / "pdf").glob("*.pdf"))
        for path in pdfs:
            data = path.read_bytes()
            sha = hashlib.sha256(data).hexdigest()
            inv = inventory.get(sha)
            if inv is None:
                print(f"- {path.name}: không khớp checksum nào trong inventory.jsonl, bỏ qua")
                continue
            if db.scalar(select(DocumentVersion).where(DocumentVersion.checksum == sha)) is not None:
                print(f"- {path.name}: đã có, bỏ qua")
                continue
            chunks, page_count = _artifact_chunks(artifact_version.get(sha, ""))
            if not chunks:
                print(f"- {path.name}: không có chunk trong artifacts, bỏ qua")
                continue
            print(f"- {path.name}: {len(chunks)} chunk artifacts ({page_count} trang)")
            meta = documents.VersionMeta(
                title=path.stem, doc_type="slide", version_label="1",
                provenance=f"Bài giảng môn Công nghệ phần mềm · data/artifacts/inventory.jsonl ({inv['relative_path']})",
                usage_permission="confirmed", acl_roles=["student", "lecturer", "reviewer"], download_allowed=False,
                integrity_label="learning_material",
            )  # fmt: skip
            try:
                version = documents.import_prechunked(
                    db, uploader, COURSE_ID, data, path.name, meta, page_count, chunks,
                    source=f"data/artifacts/chunks/{artifact_version.get(sha)}.json",
                )  # fmt: skip
                audit.record(db, actor_id=None, action="confirm_dev_usage", object_type="version", object_id=version.id,
                             course_id=COURSE_ID, reason="seed_cnpm --confirm-demo-usage (D-47: demo môn CNPM)")  # fmt: skip
                db.commit()
                documents.submit(db, uploader, version.id, acknowledge_warnings=True)
                _, index_job = documents.decide(db, reviewer, version.id, "approve", "Demo môn CNPM", version.revision)
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
