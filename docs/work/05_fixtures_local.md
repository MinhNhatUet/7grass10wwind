# 05 — Khung fixtures tài khoản test (local)

- **Ngày:** 25/09/2026
- **Yêu cầu:** viết khung `data/eval/fixtures/local.json` để người dùng tự điền tài khoản (D-08).
- **Liên quan:** BL-27, BL-28, BL-30, BL-36 (runner); UAT-09 (người duyệt khác người tải); R-04.
- **Kết quả:** hoàn thành.

## File

- `data/eval/fixtures/local.json`: 8 tài khoản, gồm SV ×3 môn, GV ×3 môn, 1 người duyệt, 1 admin. Mật khẩu tham chiếu `$ENV:EVAL_*`, không ghi giá trị thật. Các mục trong `refs` để trống. File bị gitignore (`data/`).

## Kiểm tra

- `git check-ignore` xác nhận file bị ignore.
- `load_fixtures('local')` đọc được đủ 8 tài khoản.
- Cả 8 tài khoản đều thiếu biến `EVAL_*` trong `.env` (đúng như dự kiến, người dùng sẽ tự điền).

## Còn lại

- Người dùng thêm 16 biến `EVAL_*` vào `.env`, hoặc đổi tên biến trong file cho khớp.
- Tên trường `login_id`/`password` là tạm, cần chốt theo API của TV2 (Q-11).
- Điền `refs` khi API có ID thật.
