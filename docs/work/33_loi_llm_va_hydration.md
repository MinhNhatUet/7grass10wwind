# 33 — Lỗi "AI đang tạm thời không khả dụng" và lỗi hydration

**Người dùng gửi log** của `next dev`: có lỗi hydration, và chat báo "AI đang tạm thời không khả dụng".

## 1. "AI đang tạm thời không khả dụng" (503 `LLM_UNAVAILABLE`)
- Gọi thử `POST /conversations/{id}/messages` trên server 8000: lỗi lúc có lúc không. Lần đầu trả lời được sau 58 giây, lần sau 503 sau 26 giây.
- `call_json` trước đây nuốt mất nguyên nhân. Đã thêm `logger.warning` trong `src/services/assistants/__init__.py`:
  - lỗi provider: in tên lớp lỗi và thông điệp (tối đa 300 ký tự);
  - JSON không hợp lệ: in 200 ký tự đầu của phản hồi.
- Chạy server test 8100 trên bản sao DB, hỏi 4 câu: 1 câu OK, 3 câu lỗi. Log đều là `OpenAIConnectionError: Connection error.`
- `curl https://api.vilao.ai/v1/models` 5 lần:
  - SSL connect error (exit 35) hoặc timeout 20 giây (exit 28);
  - chỉ 1 lần kết nối được (401 vì không gửi key, nghĩa là server có phản hồi);
  - DNS có lần mất 8 giây.
  - Trong khi đó `generativelanguage.googleapis.com` phản hồi trong 0.2 giây.
- **Kết luận:** lỗi do mạng hoặc phía provider vilao, không phải code. Embedding (Gemini) vẫn chạy, có lần chậm 22 giây.
- Cách xử lý (người dùng chọn): chờ vilao ổn định; đổi mạng hoặc tắt VPN/proxy; hoặc chuyển LLM sang endpoint Gemini tương thích OpenAI (chỉ đổi `.env`: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`).

## 2. Hydration mismatch
- Nguyên nhân 1: `page.tsx` chọn icon `theme === 'dark' ? <Sun/> : <Moon/>`. Lúc render ở server `theme` chưa có, nên khi trình duyệt ở chế độ tối thì icon bị lệch.
  - Sửa: render cả hai icon và ẩn/hiện bằng CSS `dark:`.
  - Nút chuyển theme dùng `resolvedTheme`, vì `theme` có thể là `"system"`.
  - `/profile` đổi sang `resolvedTheme` (menu chỉ render sau khi bấm, không gây lỗi hydration, nhưng trước đây chuyển sai khi theme là `"system"`).
- Nguyên nhân 2: extension **Dark Reader** chèn `data-darkreader-*` và style vào DOM trước khi React hydrate.
  - Sửa: `layout.tsx` thêm meta `darkreader-lock` (app có chế độ tối riêng).
  - Đã kiểm tra meta được render trong HTML.
- Các dòng `GET /assets/fastshot-bg.mp4 404` trong log là log cũ, từ trước khi bỏ video (log 31).

## Kiểm tra
- `tsc` sạch; ruff sạch; ESLint không phát sinh lỗi mới. Các lỗi còn lại ở `profile/page.tsx` là code có sẵn của TV4.
- Edge headless ở cổng 3000, chế độ sáng và tối, các trang `/`, `/login`, `/learning`: 0 lỗi hydration.
- Đã tắt server 8100 và xoá bản sao DB.
