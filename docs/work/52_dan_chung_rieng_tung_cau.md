# 52 — Dẫn chứng riêng cho từng [n], đủ ý

**Yêu cầu:** "đoạn text dẫn chứng bị trùng nhau và cx ch đủ cơ". **Quyết định:** D-56.

## Nguyên nhân
Mỗi nguồn [n] chỉ có một `citations.quote`: một dòng ngắn trùng từ nhiều nhất với tất cả các câu gắn [n]. Mọi badge [n] trong câu trả lời đều hiện cùng đoạn đó, dù mỗi câu dẫn một ý khác nhau của tài liệu.

## Thay đổi
- `assistants/__init__.py`:
  - `CITE_GROUP_RE` (cùng quy tắc với `linkCites` ở frontend);
  - `_sentence_at()`;
  - `evidence_passage(chunk, claim)`: dòng khớp nhất, mở rộng sang dòng kề (trước / sau) có điểm cao hơn; dòng không liên quan chỉ thêm khi còn dưới 200 ký tự; tối đa ~600; trang theo `page_map`;
  - `occurrence_evidence(content, used)` → `{n: [{quote, page}]}` theo thứ tự xuất hiện.
- `conversations._persist_answer`: `payload.evidence = occurrence_evidence(...)`, payload chép ra bản riêng.
- `conversations._attach_plan`: bỏ `plan_data` khỏi payload tin nhắn (trước đây payload là cùng object nên `pop` đã bỏ được; nay payload là bản chép riêng).
- Frontend:
  - `linkCites` đánh số `#cite-n-k`; badge dùng `meta.evidence[n][k]` (quote + trang), không có thì dùng đoạn trích chung;
  - popover hiện đầy đủ, cuộn khi dài (`max-h-64 overflow-y-auto`).

## Kiểm tra
- Self-check trên chunk thật "12_Tong quan Testing" (trang 17–23):
  - câu "còn gọi là kiểm thử cấu trúc…" → trang 17, khối tiêu chuẩn bao phủ;
  - câu "số đường đi vô hạn, không thích hợp cho kiểm thử hệ thống" → trang 18, trọn khối "So sánh kiểm thử hộp trắng và hộp đen" (bản đầu chỉ mở rộng về sau nên lấy nhầm phần "Hộp đen"; đã sửa sang mở rộng hai phía).
- Edge headless ở cổng 3000 (`sinhvien`), hỏi "So sánh kiểm thử hộp đen và hộp trắng":
  - 8 badge → 6 đoạn trích khác nhau, mỗi đoạn 274–526 ký tự, đúng trang (16 / 17 / 18);
  - các cặp trùng là câu dẫn cùng một ý.
- ruff sạch; `tsc` sạch; ESLint không lỗi mới.
- Dữ liệu thử: 2 hội thoại "So sánh kiểm thử hộp đen…" trong tài khoản `sinhvien`.
