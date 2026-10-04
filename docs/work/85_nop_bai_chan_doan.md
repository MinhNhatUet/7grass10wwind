# 85 — Sửa lỗi nộp bài "Tôi không biết bắt đầu từ đâu" (chẩn đoán)

## Yêu cầu
Người dùng báo: bấm "Gửi để đánh giá" ở bài chẩn đoán thì hiện "Chưa thể kết nối hệ thống lúc này". Liên quan D-30, FR-03.

## Nguyên nhân
- `save_quiz_answers` chỉ nhận tin nhắn loại `quiz`, nên tin nhắn `diagnose` bị trả 404.
- Lần merge `57a0ad4` (29/09, "ưu tiên bản TV4") đã đưa hàm về phiên bản cũ, làm mất nhánh `diagnose` (thêm ở `6f7d0fd`, 28/09) và bước gắn "trang cần đọc lại".
- Frontend hiện mọi mã lỗi chưa có trong bảng thành "Chưa thể kết nối hệ thống", nên lỗi 404 trông như mất mạng.
- Không có ca UAT nào nộp bài chẩn đoán.

## Đã làm
- `src/services/conversations.py`: nhận cả `quiz` và `diagnose`; với `diagnose`, gắn trang cần đọc lại bằng `study_tools.review_pages`.
- `frontend/src/lib/messages.ts`: thêm thông báo cho `NOT_FOUND`; mã lỗi chưa có trong bảng hiện "Chưa thực hiện được thao tác (mã X)…" thay cho "chưa kết nối".
- So các chỗ xử lý hoạt động học trước và sau merge 57a0ad4: chỉ phần nộp bài chẩn đoán bị mất.

## Kiểm tra
- Tái hiện trên bản sao DB với đúng tin nhắn `msg_3001a4bd134373fb`: trước khi sửa → `NOT_FOUND`; sau khi sửa → đánh giá được 3 chủ đề, "Kiểm thử và gỡ lỗi" được gợi ý đọc lại trang 17.
- `ruff`, `pytest`, `tsc`, eslint: đạt.

## Còn lại
- Chưa commit.
- Nên thêm ca UAT nộp bài chẩn đoán.
