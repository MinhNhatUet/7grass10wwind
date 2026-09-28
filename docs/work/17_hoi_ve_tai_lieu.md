# 17 — Nút "Hỏi về tài liệu này" (D-33)

- **Ngày:** 26/09/2026
- **Yêu cầu:** "làm nút hỏi về tài liệu này luôn đi".
- **Liên quan:** FR-05.2 (giữ "file được chọn"), BR-02, BR-03, BR-10; Wireframe UI-02 ("mở UI-03 kèm ngữ cảnh tài liệu đã chọn").
- **Kết quả:** hoàn thành. Backend đã thử bằng API với LLM thật; giao diện đã typecheck và build, chưa xem bằng trình duyệt.

## Thay đổi

- **Backend:**
  - `Conversation.document_id` (nullable), có migration SQLite `_migrate_conversation_document` (thêm cột).
  - `POST /conversations` nhận `document_id`:
    - tài liệu phải đang được phục vụ cho user (`scoped_document`), nếu không thì trả 404;
    - môn lấy từ tài liệu, không tin client;
    - tiêu đề mặc định là "Hỏi về: <tên>".
  - Mỗi lượt gửi đều kiểm tra lại: tài liệu đã thu hồi hoặc mất quyền thì trả 410.
  - Trong lượt đó, `retrieval.document_scope(...)` chỉ **thu hẹp** `servable_versions` về tài liệu đã chọn, áp dụng cho Academic, Learning và Hub.
  - Khi không đủ căn cứ, câu trả lời có thêm gợi ý bấm "Hỏi toàn bộ môn".
  - `conv_view` trả thêm `document_id` và `document_title`.
- **Frontend:**
  - **Thư viện:** mỗi tài liệu có nút "Hỏi về tài liệu này", trong trình đọc cũng có. Bấm vào thì tạo hội thoại rồi mở `/chat?conv=…`.
  - **Hội thoại:**
    - có chip "📄 Đang hỏi trong: <tên>" kèm nút "Hỏi toàn bộ môn";
    - lời chào của hội thoại mới đổi theo tài liệu;
    - trong lịch sử, hội thoại gắn tài liệu có biểu tượng 📄.

## Kiểm tra (kết quả thật, tài khoản `student_course_01`)

- Tạo hội thoại với *Elementary Number Theory* → 201, `course_id` = COURSE-01, tiêu đề "Hỏi về: Elementary Number Theory".
- SV môn 2 tạo hội thoại với tài liệu này → 404. Dùng `document_id` giả → 404.
- "Đồng dư (congruence) là gì?" → answered, 2 nguồn, **tất cả** từ tài liệu đã chọn.
- "Định lý Ore về chu trình Hamilton là gì?" (nội dung của sách khác) → insufficient_evidence, 0 nguồn. Tức là phạm vi được giữ trong tài liệu đã chọn, kể cả khi LangGraph chạy các node.
- ruff pass; pytest 5 passed; `npm run typecheck` và `npm run build` pass.

## Giới hạn

- Mỗi hội thoại gắn một tài liệu, chưa chọn được nhiều tài liệu cùng lúc.
- Các lượt test đã tạo thêm hội thoại trong DB dev.
