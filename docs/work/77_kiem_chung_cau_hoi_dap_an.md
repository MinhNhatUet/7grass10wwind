# 77 — Kiểm chứng câu hỏi – đáp án – nguồn cho hoạt động học (D-74)

## Yêu cầu
Đề xuất cải tiến Learning Assistant, mục P1 "kiểm chứng câu hỏi–đáp án–nguồn". Người dùng chọn **"làm A"**: không tốn thêm lượt gọi LLM, chưa làm lớp B (LLM giám khảo). Liên quan BR-04, BR-05, FR-03, D-38, D-69.

## Đã làm
1. **`src/services/assistants/__init__.py`**
   - `dedupe_key`: chuỗi từ đã chuẩn hóa (NFC, hoa thường, bỏ dấu câu và ký hiệu).
   - `verified_quote`: chỉ nhận câu trích dài ít nhất 20 ký tự và là chuỗi từ liên tiếp có thật trong nguồn.
   - BASE_POLICY quy tắc 7: trường `proof` cũng phải chép nguyên văn, không dịch.
2. **`src/services/assistants/study_tools.py`** (trắc nghiệm, flashcard, điền khuyết)
   - Prompt yêu cầu thêm trường `proof`: câu chép nguyên văn từ nguồn chứng minh đáp án.
   - `_proof`: kiểm `proof` trong nguồn model gắn. Nếu model gắn nhầm số mà câu trích có ở nguồn khác (vẫn đúng quyền) thì nhận nguồn thật. Không kiểm được thì loại mục.
   - Điền khuyết: đáp án phải nằm trong `proof`.
   - Lọc câu trùng.
   - `_spare`: xin model dư mục (`n + max(2, n/2)`), sau khi loại cắt về đúng `n`.
   - Ghi log `study_items_verified` gồm số mục giữ và số mục bị loại; log không chứa nội dung.
   - Mục giữ lại có trường `proof`, nên dẫn chứng `[n]` của từng mục bám sát câu trích.
3. **`src/services/course_quiz.py`** (đề GV tạo từ PDF)
   - Với tài liệu học: kiểm `proof` trong văn bản PDF, không đạt thì loại câu. Câu đạt được nối "Căn cứ trong tài liệu: “…”" vào phần giải thích để GV đối chiếu.
   - Đề có sẵn không đổi.
   - Lọc câu trùng, kể cả câu đã có trong đề.
4. **`eval/uat/run_uat_mvp.py`**
   - LA-01 / LA-02: mỗi mục phải có `proof`, không có câu trùng.
   - QZ-02: mỗi câu từ tài liệu học phải có "Căn cứ trong tài liệu".

## Diễn biến khi đo trên dữ liệu thật (SE101, gpt-4o-mini)

| Lượt | Lỗi / thay đổi | Trắc nghiệm giữ/loại | Flashcard | Điền khuyết | QZ-02 |
|---|---|---|---|---|---|
| `1015` | So nguyên văn cả ký tự: model đổi "•" thành "–" và thêm dấu chấm | 0/5 | 0/3 | 1/3 | — |
| `1017` | Chuyển sang so chuỗi từ | 2/5 | 3/3 | 3/3 | **Fail**: model dịch `proof` sang tiếng Việt, 0 câu |
| `1019`, `1020` | Prompt yêu cầu giữ ngôn ngữ gốc; PDF đạt 9/9 câu qua 3 lần thử | 3/5, 2/5 | 2/3, 1/3 | 2/3, 2/3 | Đạt |
| `1023`, `1024` | Thêm `_proof` (nhận nguồn thật) và `_spare` (xin dư) | 3 (loại 0), **5/5** (loại 1) | 3/3, 3/3 | 3/3, 2/3 | Đạt |

Các mục còn bị loại là đúng: model **diễn đạt lại** hoặc **cắt ghép** câu (ví dụ "Kiểm thử hộp đen... Tập trung vào hành vi vào/ra"), không phải câu nguyên văn.

## Kiểm tra
- Tự kiểm (assert) đạt:
  - nhận câu trích khi chỉ khác ký hiệu hoặc dấu chấm;
  - loại câu bị sửa từ, câu quá ngắn, câu cắt ghép, câu khớp giữa chừng một từ;
  - `_proof` nhận nguồn thật khi model gắn nhầm số, nhưng loại nếu nguồn đó mất quyền.
- `ruff check src tests eval/uat` và `ruff format --check`: đạt. `pytest`: 24 passed.
- UAT toàn bộ `UAT_20261003_1025`: **16 Pass / 0 Fail / 22 Blocked**, như lượt trước, không hồi quy. LA-01 19/19, LA-02 33/33, QZ-02 13/13 tiêu chí máy.

## Còn lại / rủi ro
- Chưa bắt được trường hợp đáp án sai dù câu trích có thật, hoặc câu có nhiều đáp án đúng; cần lớp B (LLM giám khảo).
- Số mục trả về có thể ít hơn số yêu cầu khi model diễn đạt lại nhiều (ví dụ điền khuyết 2/3). Hiện nội dung tin nhắn báo đúng số mục thực có.
- Token đầu ra tăng do xin dư mục và thêm trường `proof`. Mức tăng chưa đo; xem ở trang chi phí admin.
- Chưa commit.
