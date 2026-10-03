# Lộ trình hoàn thiện giao diện

Đối chiếu với code ngày 2026-10-03. Các mục đã xong được giữ lại dưới dạng lịch sử, phần còn lại là việc đang mở.

## Còn mở

| Việc | Hiện trạng | Ghi chú |
|---|---|---|
| Lưu hạn mức thật | Trang `/admin/quota` vẫn là **chế độ xem thử**, chưa có API lưu | Cần backend lưu hạn mức (PRD v2 UX-3) |
| Thông báo | Chưa có thông báo khi tài liệu được duyệt hoặc đề được phát hành | PRD v2 UX-6 |
| Build Docker frontend | Đã có `frontend/Dockerfile` và service `frontend` trong `docker-compose.yml`; chưa ghi nhận lượt build/kiểm thử Docker | Xem [hướng dẫn chạy §5](handover/huong_dan_chay.md#5-docker-tùy-chọn) |

## Đã xong (lịch sử)

| # | Việc theo lộ trình ban đầu | Kết quả |
|---|---|---|
| 1 | Điều hướng: tách trắc nghiệm `/learning` và lộ trình `/learning/plans` | Sinh viên có hai menu riêng "Ôn tập & đề kiểm tra" và "Lộ trình học"; giảng viên có menu "Câu hỏi trắc nghiệm" |
| 2 | Trắc nghiệm tạo từ tài liệu có quyền đọc: trả lời, lưu nháp, đánh giá, mở lại lịch sử từ backend, không dùng câu hỏi mẫu | Ôn tập theo chủ đề lấy từ mục lục tài liệu; nút "Lưu tạm" (`submit: false`); lịch sử lấy từ `/learning/self-checks`. Câu hỏi AI soạn có câu trích chứng minh đáp án (D-74) |
| 3 | Admin: gán môn/quyền theo vai trò, thời hạn, lý do; dùng API memberships và audit | Khu quản trị `/admin/management` (Người dùng, Môn học, Nhật ký hoạt động) gọi `/admin/users/{id}/memberships`, bắt buộc lý do (D-61) |
| 4 | Dữ liệu thật: bỏ số liệu monitoring giả, sửa hợp đồng API lộ trình | Giám sát lấy số liệu thật từ `GET /metrics` (không điền số demo); có thêm trang Chi phí AI (D-60). Trang hồ sơ đã bỏ, chỉ hiện tên người dùng (D-62) |

Kiểm tra bắt buộc vẫn áp dụng: TypeScript (`npx tsc --noEmit`), ESLint, kiểm thử quyền ở backend, build Docker. Không tự cấp quyền rộng cho tài khoản và không tạo dữ liệu production mẫu để che trạng thái trống.
