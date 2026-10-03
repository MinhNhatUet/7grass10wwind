# D-79 — Chuyển nhánh remote sang binh

- Người dùng yêu cầu đổi cả tên nhánh trên remote.
- Xác nhận remote chưa có `binh`, nhánh cũ `integration/frontend-backend` ở `e607f5f`.
- Push `binh` tại `05afe82` và thiết lập upstream `origin/binh` thành công; gồm code ndmnhat đã merge, không có log chưa commit.
- Sau khi push thành công, xóa remote `integration/frontend-backend` bằng Git theo yêu cầu.
- Fetch/prune và kiểm tra: remote còn `binh` tại `05afe82`, không còn nhánh cũ; local đồng bộ `origin/binh`.
- Giữ nguyên file local và stash, không commit thêm hoặc bỏ qua hook. Hook vẫn báo không có log để submit do chưa tích hợp Pi (D-75).
- Đây là thao tác tạo nhánh mới/xóa nhánh cũ qua Git, không dùng chức năng rename GitHub; chưa kiểm tra PR hoặc branch protection liên quan.
