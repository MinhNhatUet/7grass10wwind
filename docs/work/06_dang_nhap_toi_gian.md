# 06 — Đăng nhập tối giản trong src (UC-09)

- **Ngày:** 25/09/2026 · **Nhánh:** `feat/BL-03-tv1-eval-mvp` (chưa commit)
- **Yêu cầu:** "viết đăng nhập tối giản trong src luôn đi". Người dùng đã chốt đăng nhập cơ bản cho MVP (D-17).
- **Liên quan:** BL-05 (owner gốc **TV2**, cần báo), FR-01.1/01.2, PRD 9.1, 11.2, 11.4, NFR-08/09, BR-02. Quyết định D-17, D-18.
- **Kết quả:** hoàn thành, đã chạy thật trên app local.

## File

| File | Thao tác |
|---|---|
| `docs/plans/UC-09_BL-05_dang_nhap_toi_gian.md` | Plan mới (R-13) |
| `src/services/auth.py` | Hash scrypt, UserStore (users.json, tự nạp lại), SessionStore (chỉ lưu sha256 token), rate limiter, AuthService |
| `src/api/auth.py` | `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET /me/courses` |
| `src/main.py` | Gắn router; handler lỗi theo PRD 11.4 |
| `src/models/schemas.py` | LoginRequest/Response, UserPublic, MeResponse, CourseItem, ErrorBody |
| `src/config.py` | `auth_*` (file người dùng, TTL 480 phút, 5 lần sai/300 giây — đề xuất) |
| `scripts/seed_users.py` | Tạo `data/auth/users.json` (gitignored) từ fixtures + .env, hash mật khẩu |
| `data/eval/fixtures/local.json` | `token_field: "access_token"` (D-18) |
| `docs/decisions/decision_log.md` | D-17 sửa, thêm D-18 |

## Kiểm tra (kết quả thật)

- ruff check + format --check (eval, scripts, src): pass.
- `pytest tests/` (test có sẵn của template, .venv Python 3.12): **5 passed**.
- `seed_users.py`: 8 tài khoản, 3 môn.
- App thật (uvicorn, 127.0.0.1:8000), runner `ApiClient` đăng nhập bằng fixtures:
  - cả 8 tài khoản đều login 200, `/me` trả đúng role, `/me/courses` chỉ trả môn của chính tài khoản đó;
  - sai tài khoản → 401 `INVALID_CREDENTIALS`, không lộ tài khoản có tồn tại hay không; không token hoặc token giả → 401; thiếu trường → 422;
  - logout → 204, sau đó `/me` → 401;
  - 5 lần sai → lần thứ 6 bị 429 `TOO_MANY_LOGIN_ATTEMPTS`;
  - khóa tài khoản trong users.json → phiên đang mở bị 401 ngay, login lại cũng 401; đã khôi phục file sau khi thử.
- Log uvicorn không chứa "password".

## Giới hạn / việc còn lại

- Phiên lưu trong bộ nhớ, mất khi restart. Chưa có DB, chưa có membership `valid_from/to`, chưa có ACL tài liệu (BL-06).
- `/health` vẫn nằm ở gốc theo template. PRD 11.2 yêu cầu `/api/v1/health` và `/ready` (chưa làm, ngoài phạm vi).
- **Báo TV2**: BL-05 là việc của TV2. Bản này tối giản, TV2 có thể thay thế nhưng nên giữ contract D-17/D-18.
