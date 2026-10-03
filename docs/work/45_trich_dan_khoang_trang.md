# 45 — Trích dẫn theo khoảng trang (vd. "Trang 4–6")

**Yêu cầu:** "chỉ đúng trang nma thiếu khi tả từ trang 4-6 nma chỉ hiện mỗi trang 6". **Quyết định:** D-50.

## Nguyên nhân
Câu "mô hình thác nước" có trích dẫn trỏ trang 6 (đoạn trích là phần ưu / nhược điểm). Câu trả lời còn mô tả định nghĩa và các giai đoạn ở trang 4–5 cùng chunk. Mỗi trích dẫn chỉ lưu một trang.

## Thay đổi
- `Citation.locator_end` (int, NULL = một trang) + migration `_migrate_citation_locator_end`.
- `assistants.cited_pages(chunk, quote, answer, n)`:
  - chấm từng trang trong `page_map` theo số từ trùng với các câu gắn [n] (`_claims_for`);
  - lấy các trang đạt ≥ 50% trang tốt nhất và ≥ 3 từ, cộng trang của đoạn trích → (đầu, cuối).
- `conversations._persist_answer` lưu `locator_value = đầu`, `locator_end = cuối`; `serialize` trả `locator.end`; `/citations/{id}/source` trả `end`.
- `/documents/{id}/versions/{vid}/pages`: chunk nhiều trang được cắt theo `page_map` (trước đây chỉ hiện ở trang đầu chunk).
- Frontend: `Source.pageEnd` (`page.tsx`), `EvidenceSource.pageEnd` (`learning-cards.tsx`) → "Trang 4–6"; mở nguồn ở trang đầu.
- Đã chạy `init_db()` trên DB thật: có cột `citations.locator_end` và `chunks.page_map`.

## Kiểm tra (TestClient, bản sao DB)
- "mô hình thác nước" → [1] *03-process models* **trang 4–6**; `/source` `{value: 4, end: 6}`.
- "So sánh kiểm thử hộp đen và hộp trắng" → tr.18, tr.16 (một trang, `end = null`).
- `/pages?page_from=4&page_to=6` của *03-process models*: trang 4 "Các mô hình tiến trình…", trang 5 "Waterfall model…", trang 6 "Ưu, nhược điểm…".
- ruff sạch; `tsc` sạch; ESLint không thêm lỗi.
- Trích dẫn đã lưu trước đây không có `end` → vẫn hiện một trang; hỏi lại để có khoảng trang.
