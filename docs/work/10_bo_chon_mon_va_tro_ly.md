# 10 — Bỏ chọn môn và chọn trợ lý; router chọn cả môn (D-28)

- **Ngày:** 26/09/2026
- **Yêu cầu:** "bỏ phần chọn môn và phần chọn assistant đi khi mà có router điều phối".
- **Liên quan:** FR-11, FR-01.3, BR-02; lệch Wireframe UI-02 và FR-11.5 (đã ghi D-28 là quyết định của người dùng).
- **Kết quả:** hoàn thành.

## Thay đổi

- Router (`src/agents/nodes/orchestration.py`) chọn MÔN trong danh sách môn backend cho phép + trợ lý. Chỉ một môn → không gọi LLM để chọn môn. Không rõ môn → clarify nêu tên các môn. Bỏ node `manual_route`: ép trợ lý qua API vẫn phải chốt môn trong router.
- `src/services/conversations.py`: hội thoại tạo không cần môn; `send` truyền danh sách môn được đọc (hoặc môn cố định) và môn lượt trước; môn đã chọn lưu vào `metadata.route.course_id`, dùng cho kế hoạch, thống kê, feedback (`message_course`).
- `src/models/orm.py` + `src/db.py`: `conversations.course_id` nullable, kèm migration SQLite.
- Frontend: bỏ trang `/courses`, bỏ chip trợ lý, bỏ ô chọn môn và các ô số ngày/phút; đăng nhập → `/chat`; nhãn "Router: <trợ lý> · <môn>"; dòng "Phạm vi được phép".

## Sự cố trong khi làm (đã xử lý, không mất dữ liệu)

- Migration bản đầu lỗi (index trùng). Driver sqlite3 đã tự commit lệnh `RENAME`, làm `messages` trỏ khóa ngoại sang `conversations_old`, và `create_all` tạo lại bảng `conversations` rỗng.
- Xử lý: sao lưu `data/app.db` vào scratchpad; xóa bảng rỗng, đổi tên `conversations_old` về `conversations` (khóa ngoại tự trỏ lại); viết lại migration theo quy trình SQLite (`foreign_keys=OFF`, `legacy_alter_table=ON`, tạo bảng mới → chép → xóa → đổi tên → tạo lại index → `foreign_key_check`).
- Kết quả: 19 hội thoại đủ, 0 tin nhắn mất liên kết, `foreign_key_check` rỗng; chạy `init_db()` hai lần không lỗi.

## Kiểm tra (kết quả thật)

- ruff pass, pytest 5 passed, frontend typecheck + build pass (8 route).
- LLM thật, tài khoản GV (đọc 3 môn):
  - "Đồ thị Euler là gì?" → COURSE-01, answered, 2 citation; câu nối tiếp Hamilton → giữ COURSE-01;
  - "Cây AVL…" → COURSE-02 (chưa có tài liệu → insufficient_evidence).
- SV chỉ có COURSE-01 → router dùng luôn COURSE-01. Admin gửi câu hỏi → 403. SV tạo hội thoại cố định môn không có quyền → 403.
- Lưu ý: "Quy hoạch động" được router xếp vào COURSE-02 (có thể thuộc COURSE-03 hơn) — độ chính xác chọn môn cần đo bằng tập router có nhãn.

## Còn lại

- Đo router accuracy (cả môn lẫn trợ lý) bằng `eval/router` khi có tập nhãn. Có thể thêm trường `accepted_courses` vào RouterCase.
