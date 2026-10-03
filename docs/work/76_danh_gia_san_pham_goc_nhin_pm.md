# D-76 — Đánh giá sản phẩm từ góc nhìn PM

## Phạm vi và bằng chứng
- Đọc Brief, PRD v2 MVP, mô tả dự án, release gate, bảng đo giá trị, báo cáo eval và UAT API 2026-10-02.
- Đối chiếu auth API, MainShell, CI, các thông báo và luồng học tập.
- Không phỏng vấn người dùng, không chạy UAT trình duyệt hoặc benchmark mới. Số liệu dẫn lại từ báo cáo có sẵn, không đại diện cho phiên bản hiện tại sau mọi thay đổi.
- Không thay đổi code, không commit/push.

## Kết luận
- MVP có chiều sâu ở citation, ACL và quản trị vòng đời tài liệu; không chỉ là chatbot gọi LLM.
- Chưa đủ bằng chứng để phát hành rộng: accuracy chưa đo, chưa khảo sát/đo baseline, UAT 16 Pass/22 Blocked, thiếu xác nhận quyền sử dụng nguồn.
- Nên ưu tiên chứng minh giá trị và độ tin cậy trong một môn, chưa mở rộng tính năng hoặc nhiều môn ngay.

## Thiếu sót ưu tiên
1. Xác thực nhu cầu và đo tác vụ thật: PP-01/03/04/06, BL-30. Bảng value_measurement vẫn chưa đo; chọn một lớp/môn và GV đồng hành.
2. Kiểm chứng nội dung AI: holdout 100 mẫu, safety >=40 ca theo mục tiêu đã có. Citation mở được không chứng minh nguồn hỗ trợ mọi claim (BR-04/05/06/09).
3. Hoàn thành UAT người dùng: 22 Blocked không đồng nghĩa lỗi, nhưng cũng không phải nghiệm thu đạt. Cần GV chấm và quan sát UI/mobile.
4. Onboarding: register tạo SV chưa có môn; cần luồng xin/cấp quyền có người xử lý và thông tin liên hệ cụ thể, không tự mở quyền (BR-02/03).
5. Phản hồi chậm: báo cáo n=10 có p50 5,7s/p95 15,1s; stream cải thiện thời gian thấy phản hồi, không tự làm giảm thời gian hoàn tất. Nếu stream phải bảo đảm kiểm quyền trước khi phát nội dung (BR-03).
6. Quản lý tài khoản: bỏ trang profile không nhất thiết sai, nhưng cần nơi xem môn/quyền/hạn phiên và trợ giúp. MainShell logout chỉ xóa localStorage, không gọi endpoint revoke server; đề xuất sửa và test token cũ.
7. Vận hành: session RAM, job trong process, quota cấu hình chưa đầy đủ, giá usage ước lượng; cần backup/restore và xác minh trên đúng DB triển khai. Compose dùng PostgreSQL nhưng UAT báo cáo chạy SQLite.
8. Nguồn và dữ liệu cá nhân: UAT chưa xác nhận giấy phép; cần làm rõ loại dữ liệu gửi provider, retention/xóa và trách nhiệm vận hành. Không kết luận vi phạm khi chưa có bằng chứng.
9. Scope: brief nói không chấm chính thức/LMS; MVP có exam/midterm/final và điểm server. Cần chốt là công cụ luyện tập/thí điểm hay hệ thống đánh giá, không mặc định điểm đủ tin cậy dùng chính thức.
10. Kỷ luật release: CI hiện đã có frontend lint/build nhưng chỉ trigger main/develop; push ndmnhat không tự chạy workflow này. AI log chưa tích hợp Pi. Release gate và vài mục PRD chưa cập nhật số liệu UAT/CI mới.

## Lộ trình đề xuất để nhóm xác nhận
- Tuần 1: chốt một nhóm SV, một môn, một GV; phỏng vấn và quan sát tác vụ; freeze tính năng; xử lý logout và onboarding tối thiểu; cập nhật trạng thái release.
- Tuần 2: bộ eval do GV duyệt, safety; xử lý phần UAT blocked; đo giá trị tìm nguồn/giải thích; test đa lượt và citation; không dùng holdout tinh chỉnh.
- Tuần 3: phiên bền vững, backup/restore, quota/cost, lỗi/retry, test trên PostgreSQL và UI/mobile, CI nhánh giao hàng.
- Tuần 4: pilot nhỏ có giám sát; thu thập hoàn thành tác vụ, thời gian kiểm nguồn, người dùng quay lại, câu trả lời bị GV sửa, chi phí/tác vụ hữu ích; go/no-go.
- Số người và mọi KPI bổ sung là đề xuất, không tự thay thế ngưỡng/ràng buộc đã chốt trong PRD.

## Không ưu tiên lúc này
- Profile cầu kỳ, nhiều theme/animation, app mobile, đồng bộ Calendar hai chiều, thêm nhiều dạng bài, mở nhiều môn, thay vector DB chỉ để nâng công nghệ.
- Rerank/OCR/chia chunk chỉ làm theo lỗi quan sát và số liệu, không mặc định nâng công nghệ là tăng chất lượng.
