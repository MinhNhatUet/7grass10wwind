# 22 — Cải thiện code theo `docs/codebase-review-2026-09-27.md`

- **Ngày:** 27/09/2026
- **Yêu cầu:** người dùng: "đọc `docs/codebase-review-2026-09-27.md` và cải thiện".
- **Liên quan:** BR-03, BR-10, FR-05.4 (tái kiểm tra quyền nguồn khi trả lại/đưa vào prompt), PRD 11.4 (idempotency), FR-02/FR-03 (Academic/Learning), UI-03 (trang chat).
- **Phạm vi đã làm:** chỉ các lỗi cụ thể ở mục 7 của bản review. Cụ thể là 7.1, 7.2, 7.3, 7.4 và một phần 7.6, theo thứ tự ưu tiên ở mục 10 (giai đoạn 1–2).
- **Không làm:** 7.5 (idempotency nguyên tử, cần đổi schema và constraint), 7.7 (xóa code template), toàn bộ mục 8 (session dùng chung, job worker, migration, Docker) và regression test. Đây là các thay đổi kiến trúc hoặc cần xác nhận trước (R-07, R-13). Giai đoạn MVP cũng không viết test mới (R-08).

## Thay đổi

### 7.1 — Replay idempotency tái kiểm tra quyền (P1)
- `src/api/conversations.py::send`: gọi `svc.get_owned` trước replay, nên hội thoại đã xóa hoặc không thuộc user trả 404. Khi replay, không trả nguyên response đã lưu mà gọi `svc.replay(...)`.
- `src/services/conversations.py::replay`: đọc lại message theo `message_id` trong response đã lưu, kiểm tra message thuộc đúng hội thoại, rồi `serialize()` theo quyền hiện tại. Nguồn đã thu hồi hoặc bị khóa sẽ bị che.

### 7.2 — History đưa vào LLM lọc lại quyền (P1)
- `_history(db, user, conv, before)`: lấy tối đa 6 tin trước lượt hiện tại bằng truy vấn có `limit`, theo thứ tự `(created_at, id)`.
- Câu trả lời có citation không còn `still_servable`, hoặc câu trả lời Hub không còn tài liệu nào phục vụ được, được thay bằng `SOURCE_WITHDRAWN_MESSAGE`.
- `_previous_course(db, conv, before)`: truy vấn giảm dần có giới hạn, không còn đọc toàn bộ hội thoại.

### 7.3 — Phân trang hội thoại dài (P2)
- Backend: `GET /conversations/{id}/messages` nhận thêm `latest=true`. Khi đó trả trang mới nhất (item vẫn theo thứ tự tăng dần) và `next_cursor` để tải trang cũ hơn. Không truyền `latest` thì giữ hành vi cũ.
- Frontend (`frontend/src/app/chat/page.tsx`):
  - Mở hội thoại ở trang mới nhất.
  - Có nút "Tải tin nhắn cũ hơn". Màn hình chỉ tự cuộn xuống khi tin mới nhất thay đổi.
  - Có nút "Xem thêm hội thoại" theo `next_cursor`.

### 7.4 — Response cũ không ghi đè hội thoại đang mở (P2)
- `loadMessages` dùng `loadSeq` (số thứ tự lần tải) và `openConv` (ref hội thoại đang mở). Response của lần tải cũ hoặc của hội thoại khác bị bỏ qua. Chuyển sang "Hội thoại mới" cũng hủy các response đang chờ.
- `Pending.convId`: pending và lỗi chỉ hiện ở đúng hội thoại của request. "Thử lại" gửi vào hội thoại gốc, không gửi vào hội thoại đang mở.

### 7.6 — JSON đúng cú pháp nhưng sai cấu trúc (P2, một phần)
- `json_list` / `json_dicts` trong `src/services/assistants/__init__.py`. Áp dụng cho:
  - `learning.py`: quiz, assess, plan (bao gồm `uncovered`)
  - `study_tools.py`: diagnose, flashcards/cloze, triage
  - `academic.py`: `missing`
- Phần tử sai kiểu bị bỏ qua thay vì gây 500. Chưa có schema Pydantic và chưa có retry.

### Tài liệu
- `docs/codebase-review-2026-09-27.md`: thêm dòng "Trạng thái 27/09/2026" ở 7.1–7.4 và 7.6; cập nhật sơ đồ 5.1 và bảng lộ trình ở mục 10.

## File đã sửa
- `src/api/conversations.py`
- `src/services/conversations.py`
- `src/services/assistants/__init__.py`
- `src/services/assistants/academic.py`
- `src/services/assistants/learning.py`
- `src/services/assistants/study_tools.py`
- `frontend/src/app/chat/page.tsx`
- `docs/codebase-review-2026-09-27.md`

## Kiểm tra (kết quả thật)
- `ruff check src/ tests/`: All checks passed. `ruff format --check src/ tests/`: 51 files already formatted.
- `pytest tests/ -q`: 5 passed. Đây là test template, không phủ các thay đổi này.
- `npx tsc --noEmit --incremental false` (frontend): không lỗi. ESLint chưa được cấu hình cho project, nên không chạy.
- Smoke script trên **bản sao** `data/app.db` (backup vào scratchpad, không ghi vào DB thật), hội thoại thật 10 tin:
  - Phân trang: `latest` trả đúng 3 tin cuối và `next_cursor=3`; trang cũ hơn đúng 3 tin kế trước; không truyền `latest` thì giữ nguyên 3 tin đầu.
  - History: 6 tin, trong đó 1 câu trả lời đã có nguồn bị thu hồi trong dữ liệu thật và giờ được thay bằng thông báo thu hồi. Sau khi khóa khẩn cấp tài liệu nguồn: nội dung cũ không còn trong history (2 tin bị thay).
  - Replay sau khi khóa: trả thông báo thu hồi, 0 citation. Replay với `message_id` lạ trả NOT_FOUND. Hội thoại đã xóa mềm trả NOT_FOUND.
  - `json_dicts({"questions": ["bad", 1, {...}]})` chỉ giữ object; `json_list` với giá trị chuỗi trả `[]`.
- Chưa chạy trên trình duyệt (7.3, 7.4) và chưa gọi LLM thật.

## Còn lại / rủi ro / câu hỏi mở
- 7.5: cần quyết định cơ chế nhận quyền xử lý request (unique `(conversation_id, request_id, role)` + trạng thái đang xử lý). Việc này đổi schema, nên cần migration SQLite.
- 7.6: schema Pydantic cho từng output và retry giới hạn vẫn chưa làm.
- 7.7 và mục 8: cần người dùng xác nhận trước khi xóa template và sửa Docker/Makefile/CI.
- Regression test cho ACL, replay và history hoãn theo luật MVP; nên bổ sung khi hết giai đoạn MVP.
