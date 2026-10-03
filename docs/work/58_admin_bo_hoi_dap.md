# 58 — Admin bỏ Hỏi đáp; khu quản trị 4 nhóm (D-61)

## Yêu cầu
"bỏ phần hỏi đáp ở admin đi phần admin gồm quản lý tài liệu, giám sát cấu hình và hệ thống"

## Đã làm
### Server (default deny, BR-02)
- `src/api/conversations.py`: thêm `chat_user = require_role("student", "lecturer", "reviewer")`. Tạo hội thoại và gửi câu hỏi đều dùng dependency này, nên admin nhận 403.

### Frontend
- `login/page.tsx`: đăng nhập bằng admin thì vào `/admin`, các vai trò khác vào `/`.
- `main-shell.tsx`: nếu người dùng là admin thì `router.replace("/admin")`; bỏ mục "Quản trị" khỏi thanh bên học tập. Việc này chỉ để điều hướng; quyền thật do server kiểm tra.
- `admin-shell.tsx`: thanh bên chia theo nhóm.
  - **Quản lý tài liệu**: Tài liệu & khóa khẩn cấp (`/admin/management?tab=documents`).
  - **Giám sát**: Giám sát vận hành, Chi phí AI.
  - **Cấu hình**: Cấu hình hạn mức.
  - **Hệ thống**: Người dùng, Môn học, Nhật ký hoạt động.

  Breadcrumb hiện theo nhóm. Bỏ link "Về Chat AI", thay bằng nút "Đăng xuất".
- `admin-workspace.tsx`: tab `documents` đổi tên thành "Quản lý tài liệu".
- `app/admin/page.tsx`: `/admin` chuyển tới Quản lý tài liệu.

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: pass. `pytest`: 27 passed.
- `tsc` không lỗi trong `src`. `eslint` các file đã sửa: không có lỗi mới. Lỗi `no-explicit-any` ở `login/page.tsx` đã có từ trước.
- TestClient trên bản sao DB (tạo bằng SQLite backup):

  | Trường hợp | Kết quả |
  |---|---|
  | admin tạo hội thoại | 403 |
  | admin gửi câu hỏi | 403 |
  | admin xem `/admin/costs` | 200 |
  | sinh viên tạo hội thoại | 201 |

## Lưu ý
Cần khởi động lại backend và frontend. Chưa commit.
