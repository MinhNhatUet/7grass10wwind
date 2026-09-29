# 24 — Pull nhánh `integration/frontend-backend` (ưu tiên bản TV4)

- **Ngày:** 29/09/2026
- **Yêu cầu:** "bạn pull code từ nhánh frontend backend về". Người dùng chọn "Merge và ưu tiên bản TV4".
- **Nhánh:** merge `origin/integration/frontend-backend` (mới nhất `1693f73`, Đinh Văn Bình, 29/09 15:32) vào `ndmnhat` (`5ca538d`). Không push.
- **Kết quả:** merge xong. Backend: ruff sạch, pytest 27/27 (gồm `tests/test_document_workflows.py` của TV4). Frontend: `npm install`, `tsc`, `npm run build` pass.

## Cách xử lý xung đột

- 22 file xung đột (package.json, tsconfig, globals.css, layout, `/`, login, library, profile, requirements.txt, và 11 file backend) → **lấy bản TV4** (`git checkout --theirs`).
- File không xung đột thì git tự gộp. `data/` không bị merge đụng tới; `data/app.db` đang sửa được giữ nguyên, không commit.

## Sửa thêm sau merge (không có thì app hỏng hoặc mở lỗ hổng)

1. **`src/agents/nodes/example_node.py` trả về stub của template.** Bản TV4:
   - import `langchain_google_genai` không có trong requirements, khiến app không khởi động được và pytest không chạy;
   - gọi Gemini trực tiếp, vi phạm R-12;
   - quan trọng nhất: endpoint `POST /api/v1/chat` **không cần đăng nhập** mà đọc nội dung sách môn `COURSE-01` gửi cho LLM, tức lộ nội dung tài liệu bị giới hạn quyền (BR-02, BR-03).
   Frontend không dùng endpoint này.
2. **`src/api/auth.py`:** chuyển các import nằm giữa file (E402) lên đầu để CI (ruff) qua.
3. **`tests/test_document_workflows.py`:** hàm `answer` giả trong test nhận thêm `**kwargs`, vì router hiện truyền `retrieval_query` (Q-17). Thêm vào đó, `ruff --fix` và `ruff format` cho `src/` và `tests/` (chỉ đổi định dạng).
4. **Chốt an toàn BR-01 (`documents._run_job`):** job có loại không hỗ trợ bị đánh dấu `failed`, không còn rơi vào nhánh index/phát hành. Bản TV4 chạy `_run_index` cho mọi job khác "extract", nên một job `embed` cũ còn trong DB có thể phát hành tài liệu chưa duyệt. Đã kiểm tra DB: hiện không còn job dở nào.
5. **Khôi phục 2 API mà TV4 không có nhưng frontend còn gọi** (so danh sách route OpenAPI trước và sau merge: chỉ mất đúng 2 route này):
   - `DELETE /api/v1/conversations` (xóa tất cả lịch sử, log 14) cùng `conversations.delete_all()`.
   - `GET /api/v1/learning/plans/{id}/calendar.ics` và `LearningOptions.plan_id` (lịch Google Calendar + ôn tập đúng môn của lộ trình, D-37).
   - Thử trên bản sao DB: `.ics` → 200 (5 sự kiện), người khác → 404; xóa tất cả → `{"deleted": 2}`.

## Hiện trạng sau merge (hệ quả của việc ưu tiên TV4)

- **Frontend TV4 là giao diện chính:** `/` (chat), `/login`, `/hub`, `/learning`, `/dashboard`, `/admin/management|monitoring|quota`, `/profile`, `/library`.
- **Trang cũ của bạn vẫn còn nhưng tách rời:** `/chat`, `/lecturer/*`, `/admin`, cùng `AppShell`, `SourceReader`, `StudyTools`, `theme.css` (layout của TV4 không nạp `theme.css`).
  - Token lưu khác nhau: TV4 dùng `localStorage["token"]`, bản của bạn dùng `sessionStorage["edu04.access_token"]`. Đăng nhập qua `/login` của TV4 xong, các trang cũ coi như chưa đăng nhập.
- **Chat của TV4 (`/`)** chỉ hiện nội dung, trích dẫn, feedback và phạm vi tài liệu. Chưa hiện quiz, lộ trình (lịch, ôn tập), flashcard, điền khuyết, cấp cứu, chẩn đoán, dù backend vẫn trả đủ dữ liệu.
- **Tính năng backend bị mất do lấy bản TV4 ở file xung đột:**
  - embedding ngay khi tải lên (D-34; `_run_embed` không còn, cấu hình `embed_on_upload` thừa);
  - mã lỗi `EMBEDDING_QUOTA`;
  - `LOGIN_ID_TAKEN` + audit `self_register` (TV4 trả 400 chung);
  - gợi ý "Hỏi toàn bộ môn" khi không đủ căn cứ trong tài liệu;
  - cách tính môn của hội thoại gắn tài liệu theo bản TV4.

## Cần người dùng quyết định

- Giữ hay xóa các trang frontend cũ (`/chat`, `/lecturer/*`, `/admin`…), hay chuyển các thẻ quiz/lộ trình/flashcard sang chat của TV4.
- Có khôi phục embedding khi tải lên (D-34) không.
- **Dữ liệu đã lên git:** commit `562da6c` (26/09) đã commit và push lên `origin/ndmnhat` các file `data/app.db` (tài khoản + hash mật khẩu + hội thoại), `data/eval/fixtures/local.json`, 30 PDF sách, `data/storage/`, trái với quy tắc R-04/BR-12. Merge này không đổi các file đó. Cần quyết định có gỡ khỏi git (và làm sạch lịch sử) hay không.
