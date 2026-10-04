# 69 — Nút "Đăng nhập demo" chọn 3 vai trò (D-71)

## Yêu cầu
"ở trang đăng nhập thay cho đăng nhập bằng gg là nút đăng nhập demo khi ấn vào sẽ được chọn 3 role"

## Đã làm
- **Backend** (`src/api/auth.py`):
  - `POST /api/v1/auth/demo-login {role: student|lecturer|admin}`: server tìm tài khoản demo theo vai trò rồi cấp phiên (dùng `SessionStore` có sẵn), **không cần và không gửi mật khẩu**.
  - Tài khoản lấy từ `DEMO_CNPM_SINHVIEN_LOGIN` / `DEMO_CNPM_GIANGVIEN_LOGIN` / `DEMO_CNPM_ADMIN_LOGIN`, mặc định sinhvien / giangvien / quantri.
  - Chỉ hoạt động khi `DEMO_LOGIN_ENABLED=true` **và** `APP_ENV` khác `production`; ngược lại trả 404.
  - Kiểm tra tài khoản tồn tại, đang hoạt động và đúng vai trò; ghi audit `demo_login`.
  - `GET /api/v1/auth/demo-login` trả `{enabled}` để frontend biết có hiện nút hay không.
- **Cấu hình:**
  - `src/config.py`: thêm `demo_login_enabled` (mặc định `False`) và 3 login id.
  - `.env.example`: `DEMO_LOGIN_ENABLED=false`.
  - `.env` của máy demo: thêm một dòng `DEMO_LOGIN_ENABLED=true` ở cuối, không đụng dòng khác.
- **Frontend** (`app/login/page.tsx`):
  - bỏ nút "Đăng nhập với Google" vốn không có chức năng;
  - thêm nút **Đăng nhập demo**; bấm vào mở 3 nút Sinh viên / Giảng viên / Quản trị;
  - đăng nhập xong lưu token; admin vào `/admin`, vai trò khác vào `/`;
  - nút và vạch "HOẶC" chỉ hiện khi server bật.

## Kiểm tra
- `ruff`: đạt. `pytest`: 24 passed. Frontend `tsc` 0 lỗi, `npm run build` thành công, lint không có lỗi mới.
- TestClient trên **bản sao** DB:

  | Cấu hình | Kết quả |
  |---|---|
  | Bật, development | student / lecturer / admin → 200, đúng tài khoản sinhvien / giangvien / quantri; `/me` trả đúng vai trò; 3 dòng audit `demo_login` |
  | Tắt | cả 3 vai trò → 404, `enabled=false` |
  | Bật, nhưng production | cả 3 vai trò → 404, `enabled=false` |
  | `role=reviewer` | 422 |

## Bổ sung: bỏ vai trò Quản trị
- Người dùng: "bỏ admin đi vì admin có thể bật tắt". Quản trị có quyền bật/tắt cấu hình và đổi quyền hệ thống, nên không được vào bằng nút không cần mật khẩu.
- Backend: `DemoLogin.role` chỉ nhận `student` hoặc `lecturer`; `role=admin` → 422. Bỏ `demo_cnpm_admin_login` khỏi config.
- Frontend: còn 2 nút Sinh viên / Giảng viên (lưới 2 cột); đăng nhập xong luôn vào `/`.
- Kiểm tra lại: student 200, lecturer 200, admin 422. `pytest` 24 passed, `tsc` 0 lỗi.

## Lưu ý
- Endpoint này cho phép đăng nhập không cần mật khẩu, nên **chỉ được bật trên máy demo**. Khi triển khai thật phải giữ `false` (mặc định), hoặc đặt `APP_ENV=production`.
- Cần khởi động lại backend để đọc cờ mới trong `.env`.
- Chưa kiểm trên giao diện. Chưa commit.
