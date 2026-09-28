# 23 — Lộ trình học ↔ Google Calendar + bài ôn tập theo ngày (D-37)

- **Ngày:** 28/09/2026
- **Yêu cầu:** "tạo lộ trình học tập sẽ liên kết với gg calendar và có thể cho các bài tập để ôn tập theo ngày".
- **Liên quan:** FR-03.5–03.13, AC-03.10, BR-02, BR-04, BR-06.
- **Kết quả:** hoàn thành. Backend đã thử trên bản sao DB với LLM thật; giao diện đã chụp màn hình trên một bản chạy riêng.

## Thay đổi

- **`src/services/plan_calendar.py` (mới):** `plan_ics(plan, start, at)` sinh file iCalendar theo RFC 5545.
  - Ngày 1 của lộ trình = ngày bắt đầu; các buổi cùng ngày xếp nối tiếp từ giờ đã chọn.
  - UID ổn định `{plan}-{session}@edu04`, nên nhập lại không bị nhân đôi.
  - Nhắc trước 15 phút (`VALARM`), múi giờ Asia/Ho_Chi_Minh.
  - Thoát ký tự `, ; \ xuống dòng`; gập dòng ≤ 75 byte.
  - Có self-check: `python -m src.services.plan_calendar`.
- **`GET /learning/plans/{id}/calendar.ics?start=YYYY-MM-DD&at=HH:MM`:**
  - Chỉ chủ sở hữu (người khác → 404).
  - Chỉ plan Confirmed / InProgress / Paused (khác → 409 `PLAN_NOT_ACTIVE`).
  - `Cache-Control: no-store`.
- **Ôn tập theo ngày:**
  - `LearningOptions.plan_id`. Khi có trường này, `send()` giới hạn môn = môn của lộ trình (lấy qua `get_plan`, chỉ chủ sở hữu), vẫn kiểm tra quyền đọc môn.
  - Nút "📝 Ôn tập" gửi `assistant=learning`, `action=quiz`, `topic` = tiêu đề + mục tiêu của buổi.
- **Frontend (thẻ lộ trình):**
  - Khi kế hoạch đã xác nhận, mỗi buổi có "📝 Ôn tập" và "+ Google Calendar" (link tạo sự kiện có sẵn giờ và mô tả).
  - Khối "Đưa lộ trình vào Google Calendar": chọn ngày bắt đầu (mặc định ngày mai) và giờ (mặc định 19:00), nút "Tải file lịch (.ics)", link tới trang Nhập của Google Calendar.
  - `lib/api.ts` thêm `downloadFile()` (tải kèm Bearer, không tạo link công khai).
  - Giờ của link từng buổi tính theo cùng quy tắc với file .ics.

## Kiểm tra (kết quả thật)

- Self-check `plan_calendar` pass: 3 sự kiện, giờ nối tiếp 19:00 → 19:45, ngày 2 lúc 19:00, thoát ký tự, gập dòng.
- API trên bản sao DB, lộ trình 14 ngày của SV1:
  - `.ics` → 200 `text/calendar`, 14 sự kiện, 14 lời nhắc, `DTSTART` 20261001T193000.
  - SV2 tải lịch của SV1 → 404.
  - Ôn tập ngày 1 (LLM thật) → `answered`, kind `quiz`, 3 câu hỏi, 3 nguồn, route `manual:learning@COURSE-01` (không gọi router LLM).
  - SV2 ôn tập bằng `plan_id` của SV1 → 404.
- Chụp màn hình thẻ lộ trình (backend + frontend chạy riêng ở 8100/3100 trên bản sao DB, đã tắt; frontend đã build lại với backend mặc định): hiện đủ nút và khối Calendar. Link Google Calendar tạo đúng tham số `dates=20260929T190000/20260929T200000&ctz=Asia/Ho_Chi_Minh`.
- ruff pass; pytest 5 passed; `npm run typecheck` và `npm run build` pass.

## Chưa làm / giới hạn

- Chưa thử nhập file .ics vào tài khoản Google thật (cần tài khoản của người dùng).
- Chưa đồng bộ 2 chiều. Đổi lộ trình phải nhập lại file (UID giữ nguyên nên ghi đè sự kiện).
- Nhánh 409 cho plan Draft chưa được chạy trong test (plan có sẵn đã Confirmed).
- Múi giờ cố định Asia/Ho_Chi_Minh (ghi `ponytail:` trong code).
- **Ghi nhận:** lúc 09:01 ngày 28/09/2026, toàn bộ hội thoại của SV1 trên DB thật đã bị xóa mềm (có vẻ qua nút "Xóa tất cả"). Không phải do test (mọi test ghi dữ liệu đều chạy trên bản sao DB); tôi không khôi phục.
