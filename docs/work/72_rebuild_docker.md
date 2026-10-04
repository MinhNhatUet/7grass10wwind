# D-72 — Build và chạy lại Docker sau khi pull

## Thực hiện
- Theo yêu cầu người dùng, chạy `docker compose up -d --build backend frontend`.
- Build thành công backend và frontend; frontend hoàn thành Next.js build và kiểm tra TypeScript.
- Tạo lại hai container ứng dụng, giữ nguyên container database và volume dữ liệu.

## Kiểm tra
- Database healthy; backend và frontend đang Up.
- `GET http://localhost:8000/health`: HTTP 200, `status=ok`.
- `GET http://localhost:3000`: HTTP 200.
- Log khởi động backend/frontend không có lỗi.
- Compose cảnh báo trường `version` đã lỗi thời, không ảnh hưởng việc chạy; chưa chỉnh file compose.
- Không commit/push, không xóa dữ liệu hoặc volume.
