# 40 — Lộ trình học theo ngày cụ thể (chọn trên lịch)

**Yêu cầu:** "thêm chế độ chọn ngày cụ thể đi". Người dùng chọn kiểu "Bấm từng ngày trên lịch". **Quyết định:** D-46.

## Backend
- `LearningOptions.dates: list[str] | None` (tối đa 60). Validator `date.fromisoformat`, bỏ trùng, sắp xếp; sai định dạng → 422.
- `orchestration.learning_node` (action plan): có `dates` thì `days = len(dates)`, `plan_data["dates"] = dates`.
- `_attach_plan` lưu `dates` vào `plan.data`; `plan_view` trả `dates`.
- `update_plan`: lộ trình có ngày cụ thể thì `day` ≤ số ngày, ngoài khoảng → 422 `PLAN_DAY_OUT_OF_RANGE`; `days` = số ngày đã chọn.
- `plan_calendar.day_date()` lấy "ngày k" từ `dates[k-1]` (hoặc `start + k − 1`); `plan_ics(start=None)` dùng được khi có `dates`.
- Endpoint `.ics`: `start` không bắt buộc nếu lộ trình có ngày cụ thể; thiếu cả hai → 422.

## Frontend
- `learning/plans/page.tsx`:
  - nút chuyển "Số ngày liên tiếp" / "Chọn ngày trên lịch";
  - `DayPicker`: lịch tháng bắt đầu từ thứ Hai, ‹ › đổi tháng, ngày đã qua bị khoá, bấm để chọn/bỏ, "Bỏ chọn hết", liệt kê các ngày đã chọn;
  - gửi `learning.dates`; tin nhắn "… vào 3 ngày đã chọn (01/10, 03/10, 06/10) …".
- `learning-cards.tsx`:
  - `dayLabel()` hiện "T5 01/10" (không có ngày cụ thể thì "Ngày k");
  - `sessionStarts` theo ngày thật;
  - khối Google Calendar ẩn "Bắt đầu", hiện "Theo N ngày đã chọn"; `.ics` gọi không kèm `start`;
  - `PlanEditor` chọn ngày trong danh sách thay vì nhập số.
- `lib/api.ts`: `Plan.dates`.

## Kiểm tra
- Self-check Python: `day_date` và `plan_ics` với `dates` (01/10, 13/10, 2 buổi cùng ngày xếp nối nhau 19:00 → 19:30); `LearningOptions` bỏ trùng và sắp xếp; ngày "2026-13-40" → ValidationError.
- Edge headless ở cổng 3000 (sinhvien01):
  - chọn 01/10, 03/10, 06/10 (có thử bỏ rồi chọn lại), tạo lộ trình "Chu trình Euler và Hamilton" → chuyển sang chat ngay;
  - lộ trình hiện 3 buổi: "T5 01/10", "T7 03/10", "T3 06/10" (đúng thứ thật: Thu / Sat / Tue).
- API:
  - xác nhận lộ trình → 200;
  - `.ics?at=20:00` (không có `start`) → DTSTART 01/10, 03/10, 06/10 lúc 20:00;
  - sửa buổi sang ngày thứ 4 → 422.
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning/plans/page.tsx`, `learning-cards.tsx`.
- Dữ liệu thử: lộ trình "Chu trình Euler và Hamilton" (đã xác nhận) trong tài khoản sinhvien01.
