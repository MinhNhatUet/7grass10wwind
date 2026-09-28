# 13 — Công cụ học chủ động (D-30)

- **Ngày:** 26/09/2026
- **Yêu cầu:** người dùng dán đề xuất 4 tính năng ("Bẻ khóa rào cản 'Không biết bắt đầu từ đâu'", flashcard/điền khuyết, Contextual Analogy, "Chế độ cấp cứu sát giờ thi"). Người dùng chọn làm cả 4, kích hoạt bằng "nút gợi ý + router".
- **Liên quan:** FR-03 (mở rộng, ngoài PRD 7.2 → D-30), FR-10, FR-11, BR-04, BR-05, BR-06, BR-09; Q-17.
- **Kết quả:** hoàn thành. Đã thử bằng API với LLM thật; giao diện đã typecheck và build nhưng chưa xem bằng trình duyệt.

## Thay đổi

- **`src/services/assistants/study_tools.py` (mới):** 4 công cụ.
  - `diagnose`: đưa ra 3 câu tình huống. Khi chấm, chủ đề nào có lỗ hổng thì gắn trang nguồn để đọc lại.
  - `flashcards` và `cloze`: đáp án điền khuyết phải có nguyên văn trong chunk được trích.
  - `analogy`: làm 2 bước. Bước 1 trả lời có nguồn, chỉ hỏi về khái niệm. Bước 2 diễn lại bằng ẩn dụ dưới tiêu đề đánh dấu rõ, kèm chỗ ẩn dụ không khớp.
  - `triage`: 3 phần, giới hạn số mục mỗi phần. Phần "sai lầm" chỉ lấy từ tài liệu.
- **Router:** thêm các `learning_action` mới, cùng `topic`, `analogy_context` và `search_terms`.
  - `_retrieval_query()` ghép phần thuật ngữ còn thiếu (thường là tên tiếng Anh) vào câu truy xuất, áp dụng cho cả Academic và Learning.
  - Ngưỡng bằng chứng không bị hạ.
- **`academic.answer` và `learning.explain`:** nhận thêm tham số `retrieval_query`. Câu hiển thị vẫn là câu gốc.
- **Citation:** dạng gộp `[1, 3]` được tách thành `[1][3]` trước khi validate, để không số nào lọt qua kiểm tra. Nội dung thẻ và mục được bỏ nhãn [n] vì đã có trường `sources` riêng.
- **`conversations.save_quiz_answers`:** chấm được cả loại `diagnose`, trả kèm `review_pages`.
- **Frontend:**
  - `QuickActions`: nút gợi ý, gửi thẳng hoặc điền sẵn câu mẫu; router vẫn là bên quyết định.
  - Thêm `FlashcardDeck`, `ClozeCard`, `TriageCard`.
  - QuizCard có link "đọc trang … trước rồi quay lại".

## Kiểm tra (kết quả thật, tài khoản `student_course_01`)

- Lần chạy đầu: câu "cây khung" đạt score 0,505, dưới ngưỡng 0,55, nên ra 0 thẻ; phần ẩn dụ không xuất hiện. Đã sửa bằng `search_terms` và cách làm ẩn dụ 2 bước.
- Lần chạy lại:
  - "Giải thích định lý Ore … shipper giao trà sữa":
    - router chọn `learning:analogy@COURSE-01`, status `answered`, 2 nguồn;
    - có đoạn "Ví dụ đời thường — shipper giao trà sữa (ẩn dụ minh họa, KHÔNG phải nội dung nguồn)" và "Lưu ý";
    - không còn nhãn `[n, m]`.
  - "Tạo flashcard về cây khung": 10 thẻ, 4 nguồn. Câu truy xuất là "cây khung (spanning tree)", không bị lặp thuật ngữ.
  - "Tạo bài điền khuyết về đường đi Euler": 6 câu, đáp án (walk, closed walk, Euler circuit…) có trong nguồn.
  - Kết quả đã có từ trước: chẩn đoán gắn trang 83 và 91 để đọc lại; triage đủ 3 phần.
- `ruff check src tests` pass; pytest 5 passed; `npm run typecheck` và `npm run build` pass.

## Giới hạn

- Chất lượng ẩn dụ phụ thuộc LLM. Code chỉ đảm bảo ẩn dụ được đánh dấu rõ và chỉ dựa trên câu trả lời đã có nguồn; không kiểm được việc ẩn dụ có khớp hoàn toàn hay không.
- `search_terms` do LLM router sinh. Nếu router không đưa thuật ngữ tiếng Anh, câu tiếng Việt ngắn vẫn có thể bị cổng bằng chứng chặn. Q-17 vẫn cần hiệu chỉnh ngưỡng trên tập dev.
- Khi chạy thử, log in ra lỗi 403 của LangSmith: tracing đang bật trong `.env` nhưng key không hợp lệ. Lỗi này không ảnh hưởng chức năng.
- Là phần mở rộng ngoài PRD 7.2, cần báo nhóm (D-30).
