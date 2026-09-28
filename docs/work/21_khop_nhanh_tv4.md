# 21 — Khớp nhánh frontend của TV4 (D-35)

- **Ngày:** 28/09/2026
- **Yêu cầu:** "lấy code từ nhánh frontend và khớp với code của tôi".
- **Nhánh:** không có nhánh tên đúng là `frontend`. Nhánh phù hợp là `origin/integration/frontend-backend`, đã gộp `feat/ui-knowledge-hub` và thêm đăng ký.
- **Người dùng chọn:** giữ frontend hiện tại làm nền và lấy các trang TV4 mà bản này chưa có; lấy phần đăng ký nhưng ép vai trò Sinh viên.
- **Liên quan:** BR-02, BR-03, FR-01, FR-12.4, R-12, D-17, D-19.
- **Kết quả:** hoàn thành. Chưa merge git. Code được chuyển thủ công vào cây làm việc; nhánh TV4 giữ nguyên.

## Đối chiếu

| Trang TV4 | Bản này | Xử lý |
|---|---|---|
| `/` (chat) | `/chat` | giữ bản này |
| `/hub` | `/library` | giữ bản này |
| `/hub/manage` | `/lecturer/documents` | giữ bản này |
| `/hub/review` | `/lecturer/review` | giữ bản này |
| `/dashboard` | `/lecturer/dashboard` | giữ bản này |
| `/profile` | — | **chuyển sang** (style + `api()` của bản này) |
| `/login` (có đăng ký) | `/login` | **thêm chế độ Đăng ký**, bỏ chọn vai trò |
| `/admin/monitoring` (số cứng) | — | **dựng lại** thành tab "Vận hành" từ `GET /metrics` |
| `/admin/quota` | — | không lấy: nút lưu chỉ gọi `alert`, backend không có API |

## Không lấy từ nhánh TV4 (lý do)

- `/auth/register` với trường `role` do client gửi: ai cũng tự đăng ký làm admin hoặc reviewer được (vi phạm BR-02). Đã viết lại an toàn, xem bên dưới.
- `src/agents/nodes/example_node.py`: gọi `ChatGoogleGenerativeAI` trực tiếp (vi phạm R-12), cố định môn `COURSE-01`, lấy chunk không lọc quyền (vi phạm BR-03).
- Số liệu latency/usage viết cứng trong `admin/monitoring` (vi phạm FR-12.4).
- Token lưu trong `localStorage`: bản này giữ `sessionStorage` (D-19).

## Thay đổi

- **Backend `POST /auth/register`:**
  - `RegisterRequest` không có `role`; login_id ≥ 3 ký tự, mật khẩu ≥ 8.
  - Server luôn tạo `student` chưa có môn nào.
  - login_id trùng (không phân biệt hoa thường) → 409 `LOGIN_ID_TAKEN`.
  - Ghi audit `self_register`, sau đó đăng nhập luôn.
- **Frontend:**
  - `lib/api.ts` thêm `register()`.
  - Trang đăng nhập có nút chuyển Đăng nhập / Đăng ký.
  - Trang `/profile` mới; chip tên người dùng trên header dẫn tới trang này.
  - Quản trị có tab "Vận hành": ô số liệu gồm tổng câu hỏi, p95, số câu trả lời có nguồn, số lỗi, kèm bảng theo trạng thái. Chọn được 1, 7, 30 hoặc 90 ngày; chưa có dữ liệu thì ghi rõ.

## Kiểm tra (kết quả thật)

- Chạy trên bản sao DB: đăng ký kèm `role=admin` → 201, `role: student`, `/me/courses` rỗng, gọi `/admin/users` → 403. Trùng login_id (khác hoa thường) → 409. Mật khẩu 3 ký tự → 422.
- Chụp màn hình bằng Edge headless, server test chạy riêng ở cổng 8100/3100 (đã tắt sau khi chụp): đăng ký, hồ sơ và tab Vận hành hiển thị đúng. Tab Vận hành cho số thật trong 7 ngày: 62 câu hỏi, p95 19,2 giây.
- ruff pass; pytest 5 passed; `npm run build` pass.

## Việc còn lại

- Báo TV4: trang nào đã được lấy, những điểm vi phạm BR ở nhánh của họ, và việc chưa merge git.
- Tự đăng ký lệch D-17 (tài khoản chỉ do Quản trị tạo), đã ghi vào D-35. Nếu nhóm không muốn có tự đăng ký, chỉ cần bỏ endpoint và nút chuyển.
