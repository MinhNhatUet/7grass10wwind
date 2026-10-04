# 64 — Logging đợt 1: log JSON + mã truy vết theo request (D-65)

## Yêu cầu
Thực hiện đợt 1 trong đề xuất logging của người dùng (sau khi xong UAT và sửa P1), theo thứ tự đã thống nhất.

## Đã làm
- **`src/observability.py`** (mới, chỉ dùng stdlib):
  - `request_id` là ContextVar.
  - `JsonFormatter` ghi log JSON một dòng gồm `timestamp` (UTC), `level`, `service`, `environment`, `logger`, `event`, `message`, `http_request_id` và các trường `extra`. Formatter che `Bearer …`, khóa dạng `sk-…` / `AIza…`, và mọi trường có tên chứa pass/token/secret/key/authorization/cookie. Exception chỉ ghi `error_type`, không ghi stack hay thông báo thô.
  - `install(app)`: middleware sinh `req_<16 hex>`, gắn header `X-Request-ID`, ghi `http.request` (method, route mẫu, status, duration_ms). Lỗi không bắt được thì trả 500 JSON có `request_id`.
- **`src/main.py`:** gọi `configure_logging(...)`; CORS thêm `expose_headers=["X-Request-ID"]`. Handler `AppError` gắn `error.request_id`; lỗi ≥ 500 ghi `app.error` kèm mã lỗi.
- **`src/models/schemas.py`:** `ErrorDetail.request_id`.
- **`src/services/assistants/__init__.py`:** bỏ việc ghi lỗi thô của provider (`str(e)[:300]`) và output JSON lỗi (`text[:200]`), vì có thể chứa nội dung học tập. Nay chỉ ghi `error_type`, `provider_status`, `attempt`, `output_chars`.
- **`src/services/documents.py`:** `start_job` chạy thread bằng `contextvars.copy_context().run`, nên log của job mang mã của request khởi tạo.
- **`src/services/retention.py`:** ghi `retention.run` (số hội thoại đã dọn) và `retention.failed`, thay cho `except: pass`.
- **Frontend `lib/api.ts`, `lib/api-errors.ts`:** lỗi ≥ 500 hiện thêm "(Mã hỗ trợ: req_…)". Lỗi 4xx nghiệp vụ giữ nguyên thông báo.
- **PRD v2:** sửa câu "token thật" thành "theo usage provider; ước lượng khi provider không trả".

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: đạt. `pytest`: 24 passed. Frontend `tsc` 0 lỗi, lint 0 lỗi (17 cảnh báo).
- Kiểm trực tiếp bằng TestClient (không thêm test mới, theo quy định giai đoạn MVP):

  | Tiêu chí | Kết quả |
  |---|---|
  | Response có `X-Request-ID` dạng `req_…` | Đạt |
  | Body lỗi 401 có `error.request_id` | Đạt |
  | Header được expose qua CORS | Đạt |
  | 40 request đồng thời có 40 mã khác nhau (không lẫn context) | Đạt |
  | Log `http.request` mang `http_request_id` | Đạt |
  | Log che Bearer, khóa `AIza…`, trường `api_key`; không thấy token gửi trong header | Đạt |
  | Thread job giữ đúng mã request | Đạt |

## Chưa làm
- Chưa kiểm phần hiển thị mã hỗ trợ trên giao diện.
- Đợt 2: sự kiện router/retrieval/LLM theo từng lượt gọi, `usage_source`, `operation_id`.
- Đợt 3: Loki/Grafana, cần người dùng quyết định hạ tầng.
- Chưa commit.
