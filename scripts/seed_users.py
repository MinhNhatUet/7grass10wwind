"""Seed DB cho MVP: môn (manifest), người dùng + quyền theo môn (fixtures + .env).

Chạy từ gốc repo:
    python scripts/seed_users.py [--fixtures local]

- Môn lấy từ manifest (eval/config.json → manifest_path).
- Tài khoản lấy từ data/eval/fixtures/<env>.json; login_id/password qua "$ENV:TÊN" trong .env.
- Mật khẩu chỉ lưu hash scrypt (PRD 9.1). Không in login/mật khẩu.
- Quyền mặc định theo vai trò (PRD 5.1): student đọc môn được gán (không tải bản gốc); lecturer đọc + upload
  môn phụ trách; reviewer đọc + upload + duyệt môn phụ trách; admin không có quyền nội dung.
- Chạy lại được: cập nhật user đã có theo login_id, thay membership theo fixtures.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from eval.common import REPO_ROOT, ConfigError, load_config, load_manifest, setup_console  # noqa: E402
from eval.runner.client import _resolve_env, load_fixtures  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.models.orm import ROLES, Course, Membership, User  # noqa: E402
from src.services import audit  # noqa: E402
from src.services.auth import hash_password  # noqa: E402

DEFAULT_PERMS = {
    "student": {"can_read": True, "can_download": False, "can_upload": False, "can_review": False},
    "lecturer": {"can_read": True, "can_download": True, "can_upload": True, "can_review": False},
    "reviewer": {"can_read": True, "can_download": True, "can_upload": True, "can_review": True},
}


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Seed môn, người dùng, quyền cho MVP.")
    parser.add_argument("--fixtures", default="local")
    args = parser.parse_args(argv)

    load_dotenv(REPO_ROOT / ".env", override=True)
    try:
        config = load_config()
        manifest = load_manifest(config)
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 2

    init_db()
    db = get_sessionmaker()()
    try:
        for c in manifest.courses:
            course = db.get(Course, c.course_id) or Course(id=c.course_id, name=c.name)
            course.name, course.status = c.name, c.status or "temporary"
            db.merge(course)
        db.flush()

        n_users, skipped = 0, []
        for name, acc in fixtures.accounts.items():
            role = acc.get("role")
            if role not in ROLES:
                skipped.append(f"{name}: role '{role}' không hợp lệ")
                continue
            try:
                payload = _resolve_env(acc.get("login_payload", {}))
            except ConfigError as e:
                skipped.append(f"{name}: {e}")
                continue
            login_id, password = str(payload.get("login_id", "")).strip(), str(payload.get("password", ""))
            if not login_id or not password:
                skipped.append(f"{name}: thiếu login_id hoặc password trong .env")
                continue
            user = db.scalar(select(User).where(User.login_id == login_id))
            if user is None:
                user = User(
                    id=f"u_{name}",
                    login_id=login_id,
                    display_name=name,
                    role=role,
                    password_hash=hash_password(password),
                )
                db.add(user)
            else:
                user.role, user.status, user.password_hash = role, "active", hash_password(password)
            db.flush()
            db.execute(delete(Membership).where(Membership.user_id == user.id))
            for course_id in acc.get("courses", []):
                if role in DEFAULT_PERMS and db.get(Course, course_id):
                    db.add(Membership(user_id=user.id, course_id=course_id, **DEFAULT_PERMS[role]))
            audit.record(
                db,
                actor_id=None,
                action="seed_user",
                object_type="user",
                object_id=user.id,
                reason=f"seed từ fixtures '{args.fixtures}'",
            )
            n_users += 1
        db.commit()
    finally:
        db.close()

    print(f"Đã seed {len(manifest.courses)} môn, {n_users} tài khoản vào DB.")
    for s in skipped:
        print(f"  Bỏ qua {s}")
    return 0 if n_users else 1


if __name__ == "__main__":
    sys.exit(main())
