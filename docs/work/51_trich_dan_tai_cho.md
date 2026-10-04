# 51 — Đoạn trích hiện ngay tại [n] trong câu trả lời

**Yêu cầu:** "tôi muốn nó hiện các đoạn trích trên [n] trong chat chứ ko cần hiện ở dưới nữa". **Quyết định:** D-55.

## Thay đổi
- `components/chat/ChatMessage.tsx`:
  - `linkCites()` đổi `[n]`, `[1, 2]`, `[1][2]` thành link `#cite-n`;
  - chỉ đổi số có trong danh sách nguồn; không đổi khi đứng sau chữ / số / `)` (vd. `a[1]`, `f(x)[2]`);
  - ReactMarkdown `a` gặp `#cite-n` thì render `CitationBadge`;
  - bỏ khối "Nguồn tham khảo"; nếu có nguồn mà không có [n] nào thì hiện hàng chip "Nguồn: 1 2".
- `components/chat/CitationBadge.tsx`:
  - badge nhỏ màu primary; HoverCard (Radix, đã có trong dự án) hiện tên tài liệu, "trang a–b", đoạn trích (tối đa 8 dòng) và "Mở trang nguồn";
  - bấm badge mở bảng nguồn bên phải;
  - popover thêm `font-sans` (Portal nằm ngoài vùng có font). Menu thanh bên cũng thêm `font-sans`.

## Kiểm tra (Edge headless ở cổng 3000, `sinhvien`)
- Hỏi "So sánh kiểm thử hộp đen và hộp trắng":
  - 10 badge trong câu trả lời, không còn `[n]` thô, không còn khối "Nguồn tham khảo";
  - rê chuột vào badge "2" → "12_Tong quan Testing · trang 16" kèm đoạn trích;
  - bấm badge → mở bảng "Trích dẫn nguồn".
- Bản đầu bỏ sót chuỗi `[1][2]` (số thứ hai đứng sau `]`) → đã sửa regex; tự kiểm tra 4 ca: `[1][2]`, `[1, 2]`, `a[1]` / `f(x)[2]` giữ nguyên, `[3]` không có nguồn giữ nguyên.
- `tsc` sạch; ESLint không lỗi mới.
- Dữ liệu thử: hội thoại "So sánh kiểm thử hộp đen…" trong tài khoản `sinhvien`.
