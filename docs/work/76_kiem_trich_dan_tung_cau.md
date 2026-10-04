# 76 — Kiểm trích dẫn theo từng câu (D-73)

## Bối cảnh
Bản rà soát chỉ ra hệ thống mới kiểm "nguồn tồn tại và còn quyền", chưa kiểm "nguồn có chứng minh từng câu không". Mình đối chiếu code và xác nhận cả 5 nhận định đều đúng, kèm một kẽ hở quyền: validator chỉ xóa **nhãn** của nguồn vừa mất quyền, còn câu văn rút từ nguồn đó vẫn tới người dùng (BR-03/BR-10). Người dùng chọn làm bước 1, 2, 3 (chưa làm bước 4, LLM giám khảo).

## Đã làm (`src/services/assistants/__init__.py`, `academic.py`)
1. **Xóa cả câu khi nhãn sai hoặc nguồn mất quyền.**
   - `split_sentences` / `join_sentences`: tách câu, giữ phân cách để ghép lại đúng; nhãn đứng sau dấu chấm được trả về câu trước.
   - `validate_citations`: câu có nhãn ngoài context hoặc trỏ nguồn vừa mất quyền bị xóa cả câu. Không còn câu hợp lệ nào thì trả "không đủ căn cứ" / "nguồn đã thu hồi" như trước.
2. **Gắn nhãn khôi phục vào đúng câu.** `_restore_citations` (D-72) gắn `[n]` vào câu có nhiều từ / thuật ngữ chung nhất với câu trích đã kiểm, đặt trước dấu câu cuối; không còn dồn ở cuối câu trả lời.
3. **Mỗi câu khẳng định phải có nguồn (BR-04).**
   - Prompt yêu cầu mỗi câu khẳng định kết thúc bằng `[n]`.
   - `_inherit_labels`: câu chưa có nhãn được nhận nhãn của câu kề **trong cùng đoạn** khi server kiểm được nội dung. Điều kiện: trong các từ của câu có mặt ở các nguồn, ít nhất 60% (và tối thiểu 2 từ) nằm trong chunk của nguồn kề. Nhờ vậy câu tiếng Việt với nguồn tiếng Anh vẫn đo được qua thuật ngữ chung.
   - `mark_uncited`: câu khẳng định (≥ 8 từ, không phải câu dẫn dắt / tiêu đề / câu hỏi) vẫn không có nhãn thì được đánh dấu "*(chưa có trích dẫn)*" ngay tại câu; trạng thái chuyển `partial`.

## Kiểm tra
- **Tự kiểm:**
  - câu dùng nguồn bị thu hồi và câu có nhãn bịa `[9]` bị xóa;
  - câu chỉ còn từ nguồn bị thu hồi thì câu trả lời rỗng;
  - câu thiếu nhãn được đánh dấu, câu dẫn dắt thì không;
  - nhãn khôi phục gắn đúng câu Tarnwick / Cohesion;
  - kế thừa nhãn: câu diễn đạt lại (VI–EN) được nhận nhãn; câu lạc đề và câu thuộc nguồn khác không bị gắn nhầm.
- **Đo 7 câu hỏi thật (gpt-4o-mini):**

  | Bản | Câu dài bị đánh dấu | Trạng thái |
  |---|---|---|
  | Bước 1–3, chưa có kế thừa nhãn / prompt | 8/19 | 6/7 `partial` |
  | Bản cuối | **0** | 6/7 `answered` (câu "Design" `partial` do model tự khai `missing`) |

- `ruff`: đạt. `pytest`: 24 passed.
- UAT chạy lại: QA-02, QA-06, DOC-01, DOC-03, ACL-03 **Pass**; QA-01 26/26, QA-04 4/4, QA-05 (Blocked vì chờ GV).

## Còn lại
- Đây vẫn là kiểm bằng từ khóa, **chưa** phải kiểm chứng ngữ nghĩa từng ý. Bước 4 (LLM giám khảo kiểm từng cặp câu–nguồn) chưa làm theo quyết định của người dùng.
- Chưa kiểm phần hiển thị dấu "*(chưa có trích dẫn)*" trên giao diện. Chưa commit.
