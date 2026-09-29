# 20 — Hết quota embedding khi chat trả 503 thay vì 500

- **Ngày:** 27/09/2026
- **Yêu cầu:** người dùng dán log. `POST /conversations/{id}/messages` trả **500**, traceback là `openai.RateLimitError 429` ở `retrieval.embed_query`. Quota: `EmbedContentRequestsPerDayPerProjectPerModel-FreeTier`, giới hạn 1000.
- **Liên quan:** PRD 11.4, 11.5 (lỗi kỹ thuật phải retryable, không lưu câu trả lời thành công), NFR-05.
- **Kết quả:** hoàn thành, đã thử với tình trạng hết quota thật.

## Nguyên nhân

- `send()` chỉ bắt `LlmError` (lỗi LLM). Lỗi của provider embedding ở bước truy xuất không được bắt, nên lọt ra thành 500.
- Việc hết quota trong ngày là giới hạn gói free của Gemini, không phải lỗi code (xem log 16).

## Thay đổi

- `retrieval.EmbeddingUnavailableError`: `embed_query` bọc mọi lỗi provider vào exception này và ghi lại lỗi có phải do giới hạn tốc độ không.
- `conversations.send`: bắt lỗi này và trả `503` retryable, mã `EMBEDDING_QUOTA` (hết quota) hoặc `EMBEDDING_UNAVAILABLE`. User message vẫn được lưu, không có câu trả lời "thành công" nào được tạo, và hệ thống không trả lời khi không có nguồn.
- `frontend/src/lib/messages.ts`: thêm thông báo "Dịch vụ tìm nguồn đã hết hạn mức sử dụng hôm nay. Vui lòng thử lại sau."

## Kiểm tra

- Lúc đang hết quota thật: gửi "Tạo flashcard về cây khung" → `503 {"code": "EMBEDDING_QUOTA", "retryable": true}`. Hội thoại tạo ra để test đã được xóa.
- ruff pass; pytest 5 passed; `npm run typecheck` pass.
