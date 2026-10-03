# 56 — UI giảng viên gọn 3 mục + tạo đề trắc nghiệm từ PDF (D-59)

## Yêu cầu
"sửa UI giảng viên gồm hỏi đáp và quản lý tài liệu câu hỏi trắc nghiệm giảng viên có thể up đề bằng pdf và llm gen ra"

## Đã làm
### Điều hướng giảng viên
- `main-shell.tsx`: giảng viên và người duyệt chỉ thấy 3 mục:
  - **Hỏi đáp**;
  - **Quản lý tài liệu** (người duyệt thấy "Duyệt tài liệu");
  - **Câu hỏi trắc nghiệm**.

  Bỏ "Tài liệu học tập" và "Không gian làm việc". Admin vẫn có mục "Quản trị".
- `app/hub/manage`, `app/hub/review`, `app/dashboard` được chuyển (git mv) vào `app/(main)/`, nên có chung thanh bên với Hỏi đáp. URL không đổi; `app/hub/page.tsx` giữ nguyên.
- `manage-hub.tsx`:
  - bỏ thanh bên riêng (Chat AI / Hồ sơ / bộ lọc) và header giả (chuông, avatar "B", ô tìm kiếm trùng);
  - bộ lọc Dashboard / Bản nháp / Chờ duyệt / … chuyển thành hàng nút trên nội dung;
  - khung trang dùng `h-full overflow-y-auto` để cuộn trong khung chung.
- `(main)/learning/page.tsx`: với giảng viên, tiêu đề là "Câu hỏi trắc nghiệm" và chỉ có trình soạn đề; bỏ tab "Học tập của tôi".

### Tạo đề từ PDF
- `page_render.pdf_text(data, max_chars)`: đọc chữ từ PDF trong bộ nhớ bằng pypdfium2 (có khoá luồng), không lưu file.
- `course_quiz.generate_from_pdf`:
  - chỉ người phụ trách môn (`get_manageable`), chỉ đề Nháp;
  - file phải bắt đầu bằng `%PDF`; PDF không có lớp chữ (scan) trả lỗi 422;
  - lấy tối đa 60k ký tự (`ponytail:` ghi rõ giới hạn và hướng nâng cấp);
  - gọi `call_json` (qua `get_llm`); nội dung PDF nằm trong `<tai_lieu>` và được coi là dữ liệu (BR-09).
- Nội dung prompt:
  - PDF đã là đề → chép đúng câu hỏi và lựa chọn, đáp án lấy theo tài liệu; không có đáp án thì `correct: null`;
  - PDF là tài liệu học → soạn câu mới chỉ từ nội dung, 1 đáp án đúng và 3 phương án nhiễu.
- Hậu xử lý câu hỏi:
  - bỏ nhãn "A." / "B)" ở đầu lựa chọn;
  - bỏ câu không đủ 4 lựa chọn;
  - thêm vào cuối đề, giới hạn tổng 100 câu, mỗi lần tối đa 50 câu;
  - ghi audit `quiz_generate`.
- API `POST /api/v1/course-quizzes/{id}/generate` (multipart `file`, `count`):
  - hàm sync, chạy trong threadpool nên gọi LLM không chặn event loop;
  - giới hạn dung lượng theo `upload_max_mb`.
- `quiz-builder.tsx`:
  - nút **Tạo đề từ PDF**: tạo đề Nháp mới đặt tên theo file rồi sinh câu hỏi;
  - ô **Thêm câu từ PDF** trong đề Nháp;
  - chọn số câu tối đa (5–50);
  - sau khi sinh, báo số câu đã thêm và số câu chưa có đáp án;
  - phát hành vẫn bắt buộc đủ 4 lựa chọn và đáp án (`QUIZ_INCOMPLETE`).

## Kiểm tra
- `ruff check src tests`, `ruff format --check src tests`: pass. `pytest`: 27 passed.
- `npx tsc --noEmit`: không lỗi trong `src`; chỉ còn lỗi ở `.next/types` cũ trỏ tới đường dẫn đã chuyển, sẽ tự hết khi dev server dựng lại.
- `eslint` các file đã sửa: 0 lỗi; các cảnh báo còn lại đã có từ trước.
- Thử API bằng TestClient trên **bản sao** `data/app.db` (trong scratchpad), với PDF thật của SE101 và LLM giả lập:
  - giảng viên phụ trách → 200, thêm 2/3 câu (câu thiếu lựa chọn bị bỏ);
  - nhãn "A." được bỏ khỏi lựa chọn;
  - prompt có `<tai_lieu>` và `[Trang 1]`;
  - file không phải PDF → 422; sinh viên → 404;
  - đề đã phát hành → 409;
  - audit `quiz_generate` được ghi.

## Chưa làm
- Chưa gọi LLM thật lần nào (để không tốn lượt); cần thử trên giao diện.
- Chưa hỗ trợ PDF scan (cần OCR).
- Chưa commit.
