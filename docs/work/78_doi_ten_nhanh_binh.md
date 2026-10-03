# D-78 — Đổi tên nhánh local thành binh

- Theo yêu cầu người dùng, đổi tên nhánh hiện tại từ `integration/frontend-backend` thành `binh` bằng `git branch -m binh`.
- Không thay đổi commit hoặc working tree; các log local và stash giữ nguyên.
- Upstream vẫn là `origin/integration/frontend-backend`; chưa tạo `origin/binh`, chưa xóa nhánh remote cũ và chưa push.
- Kiểm tra `git status --short --branch` xác nhận nhánh local là `binh`.
