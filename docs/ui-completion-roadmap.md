# Lộ trình hoàn thiện giao diện

Thứ tự triển khai:
1. Điều hướng: phân biệt trắc nghiệm `/learning` và lộ trình `/learning/plans`.
2. Trắc nghiệm: tạo từ tài liệu có quyền đọc, trả lời, lưu nháp, đánh giá, mở lại lịch sử từ backend; không dùng câu hỏi mẫu.
3. Admin: giao diện gán môn/quyền theo vai trò, thời hạn, lý do; sử dụng API memberships và audit hiện có.
4. Dữ liệu thật: bỏ số liệu monitoring giả; sửa hợp đồng API lộ trình. Hồ sơ, quota lưu thật và thông báo cần đợt bổ sung backend riêng nếu chưa có API.

Kiểm tra bắt buộc: TypeScript, ESLint các file mới, kiểm thử quyền backend, build Docker. Không tự cấp quyền rộng cho tài khoản và không tạo dữ liệu production mẫu để che trạng thái trống.
