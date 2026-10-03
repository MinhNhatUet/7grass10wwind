# 38 — Ôn tập theo chương

**Yêu cầu:** "các chủ đề bạn lọc ch ôn lắm, tôi nghĩ nên chọn theo 1 chương lớn chứ tách thành nhiều section nhỏ sẽ có những section kiểu ví dụ". **Quyết định:** D-44.

## Thay đổi
- `page_render.chapters(storage_key)`:
  - đọc mục lục PDF bằng pdfium (dùng chung khoá pdfium, `lru_cache`);
  - cấp 0 là chương, cấp 1 là mục con;
  - bỏ Contents / Preface / Index / References / Answers / Hints / Appendix và mục Exercises;
  - số chương lấy từ "5. Graph Theory", tên không có số thì đánh theo thứ tự.
- `GET /learning/topics` (`api/quizzes.py`) trả `{chapter, title, document, page, sections}`. Tài liệu không có mục lục thì dùng `_chapters_from_text` (gom tiêu đề "5.3 …" theo số chương). Bỏ `_section_key` không còn dùng.
- `learning-hub.tsx` (`TopicPractice`):
  - thẻ chương (tên + 4 mục đầu + "+n mục"), lọc theo tên chương hoặc mục;
  - chọn chương thì chủ đề gửi trợ lý gồm tên chương, danh sách mục và yêu cầu "trải đều các mục";
  - tin nhắn hiện ngắn gọn: "Ôn tập Chương 5: Graph Theory — …".
- Sự cố trong lúc làm: script vá file lại biến `\b` và `\1\2` thành ký tự điều khiển (backspace, \x01 \x02). Đã sửa bằng `chr(92)`, quét toàn bộ `src`, `frontend/src`, `scripts`, `docs` → sạch.

## Kiểm tra
- `chapters()` trên 2 sách: mỗi sách đúng 6 chương.
  - Tổ hợp: Fundamentals … Polya-Redfield Counting.
  - Number Theory: Prime Numbers … Elliptic Curves.
  - Không còn Contents, Preface, Answers and Hints, References, Index.
- TestClient trên bản sao DB: sinhvien01 COURSE-01 → 12 chương; sinhvien02 (không học COURSE-01) → danh sách rỗng.
- Edge headless ở cổng 3000:
  - hiện 12 thẻ chương; lọc "hamilton" → "Chương 5 · Graph Theory";
  - chọn chương đó, trắc nghiệm 5 câu → câu hỏi trải đều các mục (Hamilton, lưỡng phân, cây, Jarník / cây khung nhỏ nhất, định lý 5.5.4).
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning-hub.tsx`.
- Hội thoại ôn tập tạo trong lúc thử nằm trong tài khoản sinhvien01.
