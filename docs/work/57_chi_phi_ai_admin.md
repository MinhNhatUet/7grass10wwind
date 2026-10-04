# 57 — Trang "Chi phí AI" cho admin (D-60)

## Yêu cầu
"sửa lại cho admin có thêm cả phần tính chi phí"

## Hiện trạng trước khi sửa
Bảng `usage_events` đã có cột `tokens_input`, `tokens_output`, `estimated_cost` (từ nhánh quanghung), nhưng không nơi nào đếm token: `AssistantResult.tokens_*` luôn bằng 0 và `estimated_cost` luôn bằng 0. Làm trang báo cáo ngay thì mọi số liệu sẽ là 0.

## Đã làm
### Đếm token và tính chi phí (backend)
- `src/services/assistants/__init__.py`:
  - `track_usage()` là context manager dùng ContextVar, giữ hộp đếm `[vào, ra]`;
  - `call_json` cộng `resp.usage_metadata` sau mỗi lần gọi LLM; nếu provider không trả usage thì ước lượng ~4 ký tự/token;
  - hộp đếm được dùng chung theo tham chiếu, nên vẫn cộng đúng khi LangGraph chạy node trong thread với context sao chép (đã kiểm tra).
- `src/services/usage.py` (mới): `cost_usd()` tính theo bảng giá trong settings; `record()` ghi một `UsageEvent` kèm token và chi phí; `NON_CHAT` là danh sách các lượt không tính vào hạn mức câu hỏi.
- Các nơi gắn đếm token:
  - `conversations.send`: bọc router và trợ lý trong `track_usage()`; khối `finally` ghi bằng `usage.record`;
  - `save_quiz_answers` (chấm bài tự kiểm tra): ghi `quiz_assess`;
  - `course_quiz.generate_from_pdf`: ghi `quiz_generate`, kể cả lượt lỗi vì lượt lỗi vẫn có thể đã tốn token;
  - `_check_quota` không đếm hai loại `NON_CHAT` này.
- `src/config.py` và `.env.example`: thêm `LLM_PRICE_INPUT_PER_1M` (0.10), `LLM_PRICE_OUTPUT_PER_1M` (0.40), `USD_TO_VND` (26000). Đây là giá mặc định đề xuất, cần chỉnh theo hoá đơn nhà cung cấp thật.

### API và trang admin
- `GET /api/v1/admin/costs?days=` (chỉ admin):
  - tổng số lượt, token, USD và VND, kèm số lượt cũ chưa đếm token;
  - chia theo ngày, theo chức năng, theo môn, và top 10 người dùng;
  - bảng giá và tên mô hình đang dùng;
  - chỉ số liệu vận hành, không đọc nội dung hội thoại.
- `frontend/src/app/admin/costs/page.tsx`: trang "Chi phí AI"
  - chọn khoảng 7, 30, 90 ngày hoặc 1 năm;
  - 4 thẻ tổng: chi phí, lượt gọi, token vào, token ra;
  - biểu đồ cột theo ngày bằng CSS, không thêm thư viện;
  - bảng theo chức năng, theo môn, top người dùng;
  - ghi chú bảng giá và cách chỉnh trong `.env`.
- `admin-shell.tsx`: thêm mục "Chi phí AI" vào thanh bên quản trị.

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: pass. `pytest`: 27 passed.
- `tsc` không lỗi trong `src`; `eslint` các file mới/sửa: 0 lỗi.
- Đếm token, với LLM giả lập:
  - 2 lần gọi, trong đó 1 lần chạy trong thread với context sao chép → `[2000, 400]`;
  - provider không trả usage → ước lượng `[200, 2]`;
  - 1 triệu token vào + 1 triệu token ra → $0.50.
- `/admin/costs` trên bản sao DB, tạo bằng SQLite backup API (chép file thường sẽ thiếu phần WAL):
  - tổng số liệu và phần chia theo chức năng đúng;
  - 29 lượt cũ được báo là chưa đếm token;
  - tài khoản sinh viên → 403.

## Lưu ý
- Các lượt trước bản sửa này được tính 0₫.
- Chưa tính chi phí embedding (Gemini đang dùng gói miễn phí).
- Cần khởi động lại backend. Chưa commit.
