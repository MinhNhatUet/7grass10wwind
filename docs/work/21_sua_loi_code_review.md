# 21 — Sửa 3 lỗi từ code review (thay đổi chưa commit)

- **Ngày:** 27/09/2026
- **Yêu cầu:** người dùng chạy `/code-review` trên các thay đổi chưa commit của nhánh `feat/BL-03-tv1-eval-mvp`, rồi yêu cầu "bạn sửa đi".
- **Liên quan:** FR-03 (Learning Assistant: quiz, chẩn đoán, flashcard, cấp cứu), FR-10 / BR-04 (citation hợp lệ).
- **Kết quả:** đã sửa cả 3 lỗi, chưa commit.

## Lỗi và cách sửa

1. **Nhãn citation trùng với chỉ số mảng** (`src/services/assistants/__init__.py`)
   - `MULTI_CITATION_RE` biến `A[1, 2]` thành `A[1][2]`, nên chỉ số mảng 2 chiều bị tính là citation [1], [2].
   - `strip_citations` biến "A[1] ≤ A[2]" thành "A ≤ A" trong flashcard, bài điền khuyết và chế độ cấp cứu.
   - Sửa: thêm lookbehind `(?<![\w\])])`, nên ngoặc dính liền sau tên biến hoặc sau `]`/`)` không còn bị coi là nhãn nguồn. `[1, 3]` và `.[2,4]` đứng sau dấu cách hoặc dấu câu vẫn được tách và kiểm tra như trước.
   - Không đổi `CITATION_RE`, để không làm mất citation hợp lệ mà LLM viết dính chữ.
2. **Chủ đề hiển thị bị lẫn thuật ngữ truy xuất** (`src/agents/nodes/orchestration.py`, `learning.py`, `study_tools.py`)
   - Trước đây `topic` được gắn thêm `search_terms` của router, rồi được hiển thị cho người dùng và lưu vào payload, ví dụ “cây khung (spanning tree)”.
   - Sửa: tách `topic` (để hiển thị và đưa vào prompt) khỏi `query` (chỉ dùng để truy xuất). `quiz`, `diagnose`, `flashcards` và `triage` nhận thêm tham số `retrieval_query` (không bắt buộc). `analogy` giữ nguyên, vẫn nhận `query`.
3. **Chẩn đoán gắn nhầm trang cần đọc lại** (`study_tools.review_pages`)
   - Khi chủ đề bị LLM viết lại, cách khớp cũ lấy ứng viên đầu tiên chỉ cần trùng một từ có từ 3 ký tự trở lên. Vì vậy hai chủ đề chỉ chung các từ như "của", "các", "cây" cũng bị khớp nhầm.
   - Sửa: thêm hàm `_closest_topic`. Chỉ khớp khi ít nhất 60% âm tiết của tên ngắn hơn có trong tên kia, và chỉ có đúng một ứng viên tốt nhất. Nếu không khớp chắc chắn thì không gắn trang nào.

## File đã sửa

- `src/services/assistants/__init__.py`
- `src/services/assistants/learning.py`
- `src/services/assistants/study_tools.py`
- `src/agents/nodes/orchestration.py`

## Kiểm tra

- `ruff check src/ tests/`: All checks passed.
- `ruff format --check src/ tests/`: 51 files already formatted. Trước đó đã chạy `ruff format` cho `study_tools.py`.
- Chạy thử regex:
  - `"A[1, 2] vs cây [1, 3]. x.[2,4]"` cho ra `"A[1, 2] vs cây [1][3]. x.[2][4]"`.
  - `strip_citations("A[1] <= A[2] đúng [3]. ok [1, 2]")` cho ra `"A[1] <= A[2] đúng. ok"`.
- Chạy thử `review_pages`:
  - "Khái niệm cây nhị phân" khớp đúng chủ đề "Cây nhị phân" (trang 10).
  - "Định nghĩa của đồ thị" không còn bị gắn nhầm vào "Độ phức tạp của thuật toán".
- Import `src.agents.orchestrator`: thành công.
- Không viết unit test mới (giai đoạn MVP, R-08). Chưa chạy lại luồng chat với LLM thật.

## Còn lại / rủi ro

- Nếu LLM viết citation dính chữ ở dạng gộp, ví dụ `tree[1, 3]`, nhãn này không còn được tách và kiểm tra, mà giữ nguyên như chữ thường. Hành vi này giống trước khi thêm `MULTI_CITATION_RE`.
