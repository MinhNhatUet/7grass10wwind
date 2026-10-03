# D-75 — Kiểm tra AI usage logging

## Kết quả
- Hook Git pre-push có chạy ở lần push gần nhất: scanner Antigravity báo không có prompt mới, submitter báo không có log để gửi.
- `.claude/settings.json` chỉ cấu hình hook Claude; `.agents/hooks.json` gọi scanner Antigravity. Pre-push hiện chỉ gọi scanner Antigravity rồi submit_log.
- Không có tích hợp thu thập prompt Pi trong các hook đang kiểm tra. Phiên hiện tại chạy bằng Pi, nên prompt không tự chuyển vào `.ai-log/session.jsonl`.
- `AI_LOG_SERVER`, `AI_LOG_API_KEY`, `AI_LOG_DIR` đã cấu hình; không in giá trị khóa hoặc gửi dữ liệu ra server trong bước kiểm tra.
- Log directory hiệu lực là `.ai-log`; không có file pending `session.jsonl`.
- Archive hiện có 1 entry codex và 156 entry antigravity; không có entry Pi.
- Transcript Pi của phiên hiện tại tồn tại và có user messages, nên có nguồn để thu hồi prompt thật nếu bổ sung tích hợp.

## Phạm vi
- Chỉ chẩn đoán, không thay đổi hook, không tạo log prompt giả và không submit transcript.
- Đề xuất bổ sung collector Pi từ transcript thật và tích hợp vào pre-push/realtime extension; cần đọc tài liệu Pi trước khi triển khai.
- Chưa commit/push log công việc này.
