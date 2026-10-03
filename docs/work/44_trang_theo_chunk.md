# 44 — Trích dẫn đúng trang, embedding theo chunk của pipeline

**Yêu cầu:**
- "nó bị hiện sai trang";
- "ở chunking tôi thấy có đặt theo page mà";
- "ko được embedding từ pdf mà từ chunk và lấy trang theo đó vì khối lượng data cbi thêm rất lớn bạn embedding v sẽ tốn tiền và tgian của tôi".

**Quyết định:** D-49.

## Nguyên nhân
Chunk artifacts có `locator {start, end}` là một khoảng 7–10 trang (vd. 17–23). Lúc nạp (D-47), chunk được gắn vào trang `start`, nên đoạn trích ở trang 18–23 mở trang 17.

## Diễn biến
- Thử tách chunk theo trang (517 đoạn). Người dùng dừng vì tốn embedding; tiến trình đã bị dừng.
- Chính lần chạy tách trang đó đã dùng hết **quota Gemini free tier 1000 request/ngày** (`embed_content_free_tier_requests`). Lần nạp lại sau đó báo 429, SE101 tạm thời không còn bản Published.
- Khôi phục `data/app.db` từ `backup/db/app_2026-10-01_truoc_tach_trang.db` (15 bản Published, 76/76 chunk đã có embedding). Sao lưu bản lỗi vào `backup/db/app_2026-10-01_loi_quota_embedding.db`.
- Xoá 2 hội thoại cũ, trong đó có "mô hình chữ V" (người dùng đồng ý).

## Thay đổi
- `Chunk.page_map` (JSON) + `Chunk.page_at(offset)`; migration `_migrate_chunk_page_map`.
- `assistants.quote_page(chunk, quote)`: tìm 8 từ đầu của đoạn trích (bỏ qua khác biệt khoảng trắng) → trang. `format_sources` ghi "trang a–b".
- `conversations._persist_answer`: `Citation.locator_value = quote_page(...)`. `api/sources.citation_source` trả locator của trích dẫn.
- `documents.import_prechunked()`: nhập tài liệu đã chunk sẵn, không trích xuất lại, vẫn qua duyệt và index.
- `scripts/seed_cnpm.py`:
  - `_artifact_chunks` trả 1 chunk app cho mỗi chunk artifacts, kèm `page_map`;
  - dùng `import_prechunked`; bỏ `EMBED_ON_UPLOAD=false`;
  - `fill_page_map()` + cờ `--fill-page-map` (dò text từng phần tử trong chunk đã có).
- Đã chạy `--fill-page-map`: 76/76 chunk có page_map, **0 lần embedding**.

## Kiểm tra
- Chunk "12_Tong quan Testing" trang 17–23: câu "So sánh kiểm thử hộp trắng và hộp đen" → trang 18; câu đầu → trang 17.
- Lấy mẫu 222 dòng trong 76 chunk, so với `data/artifacts/pages`: **219/222 đúng trang**. 3 dòng lệch là câu lặp ở nhiều trang hoặc dòng công thức.
- ruff sạch.
- **Chưa thử hỏi đáp trực tiếp:** câu hỏi cũng cần embedding (truy vấn) mà quota hôm nay đã hết. Quota Gemini free tier đặt lại lúc 0h giờ Thái Bình Dương (khoảng 14h–15h giờ VN).
- 2 server 8000 / 3000 chạy nền đã bị dừng vì quá giới hạn thời gian chạy nền của phiên.

## Bổ sung: key Gemini mới
- Người dùng thay `GEMINI_API_KEY` mới (không in ra). Embedding chạy lại được; vector của key mới trùng vector đã lưu (cosine 1.0, cùng model `gemini-embedding-001`, 768 chiều) → **không cần embedding lại**.
- Thử hỏi đáp (TestClient trên bản sao DB, `sinhvien`):
  - "So sánh kiểm thử hộp đen và hộp trắng" → [1] tr.18, [2] tr.16;
  - "Các nguyên lý thiết kế phần mềm" → tr.23, tr.13, tr.10;
  - **5/5 trích dẫn đúng trang** chứa đoạn trích (đối chiếu `data/artifacts/pages`); `/citations/{id}/source` mở đúng trang đó.
  - "Mô hình chữ V là gì?" → trả lời không trích dẫn: slide CNPM không có nội dung mô hình chữ V, đúng hành vi khi thiếu nguồn (BR-05).
