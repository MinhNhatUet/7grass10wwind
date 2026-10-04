# 67 — Đáp án trắc nghiệm toàn A → chia đều A–D (D-69)

## Yêu cầu
"tạo trắc nghiệm full A nên cần phải đảo đi"

## Đã làm
- `balance_answers(items)` trong `src/services/assistants/__init__.py`:
  - gán vị trí đáp án đúng theo vòng lặp vị trí đã xáo (mỗi 4 câu có đủ A, B, C, D), phương án nhiễu xáo ngẫu nhiên, nội dung đáp án đúng giữ nguyên;
  - bỏ qua câu có lựa chọn nhắc tới lựa chọn khác ("Cả A và B", "Tất cả các đáp án trên", "all of / none of / both").
- Áp dụng ở 2 nơi:
  - trắc nghiệm ôn tập của sinh viên (`study_tools`, action `mcq`);
  - đề GV tạo từ PDF **tài liệu học** (`course_quiz.generate_from_pdf`, chỉ khi `_is_material`). Đề có sẵn chép từ PDF giữ nguyên thứ tự gốc.
- Prompt của cả hai nơi dặn không nhắc chữ cái A–D trong lựa chọn hay giải thích, vì thứ tự sẽ bị xáo.
- Tách hàm `_is_material()` từ `_keep_answers()` để dùng chung.

## Kiểm tra
- `ruff`: đạt. `pytest`: 24 passed.
- Tự kiểm (đầu vào giả lập toàn A):

  | Số câu | Phân bố A/B/C/D | Chênh lệch |
  |---:|---|---:|
  | 4 | 1/1/1/1 | 0 |
  | 5 | 1/1/2/1 | 1 |
  | 10 | 3/3/2/2 | 1 |
  | 20 | 5/5/5/5 | 0 |

  Đáp án vẫn đúng nội dung sau khi xáo; câu "Cả A và B" / "Tất cả các đáp án trên" được giữ nguyên.
- UAT với LLM thật:
  - LA-01: 23/23, đáp án `CDABB`;
  - QZ-02: 12/12, câu soạn từ tài liệu học `DBC`, đề có sẵn giữ đúng `DAA`.

## Lưu ý
Bài và đề đã tạo trước đó không đổi; muốn có đáp án chia đều thì tạo lại. Chưa commit.
