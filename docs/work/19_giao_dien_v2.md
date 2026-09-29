# 19 — Làm đẹp giao diện (giao diện v2)

- **Ngày:** 27/09/2026
- **Yêu cầu:** "bạn sửa lại ui cho đẹp".
- **Liên quan:** Wireframe UI-01, UI-03, UI-06, UI-07. Chỉ đổi trình bày, không đổi luồng hay quyền (BR vẫn do server kiểm tra).
- **Kết quả:** hoàn thành. Đã chụp màn hình thật trước và sau khi sửa bằng Edge headless (playwright-core cài tạm trong scratchpad, không thêm vào dự án). `npm run typecheck` và `npm run build` pass.

## Thay đổi

- **`frontend/src/app/theme.css` (mới, nạp sau `globals.css`):**
  - Bộ token mới: indigo `#4f46e5`, nền `#f4f6fb`, bo góc 12px, 3 mức đổ bóng.
  - Font **Be Vietnam Pro** qua Google Fonts (link trong `layout.tsx`); không tải được thì dùng font hệ thống.
- **Header (`AppShell`):**
  - Logo "X" dạng gradient, kèm tên "EDU-04 · Kho tri thức học thuật".
  - Menu tô sáng trang đang mở (`usePathname`).
  - Avatar chữ cái đầu, tên và vai trò; nút "Đăng xuất" dạng nhẹ.
  - Header dính trên cùng, nền mờ.
- **Đăng nhập:** bố cục 2 cột. Bên trái là phần giới thiệu nền gradient với 3 điểm chính của sản phẩm, bên phải là form. Màn hẹp chỉ hiện form.
- **Hội thoại:**
  - **Màn trống:** lời chào theo tên người dùng; 5 nút bắt đầu nhanh thành thẻ có biểu tượng và mô tả. Khi đã có tin nhắn, các nút này thu gọn thành hàng chip cuộn ngang.
  - **Tin nhắn:** khung giữa rộng tối đa 820px. Bong bóng người dùng dùng gradient, câu trả lời là thẻ trắng. Chip trích dẫn đổi màu khi rê chuột.
  - **Ô nhập:** dạng nổi, bo tròn, sáng viền khi focus.
  - **Lịch sử:** mục đang mở được tô, nút xóa chỉ hiện khi rê chuột.
  - **Panel nguồn khi trống:** có biểu tượng và hướng dẫn.
- **Thư viện:**
  - Thẻ tài liệu có biểu tượng sách và nhãn loại.
  - Ô tìm và lọc gộp thành một thanh.
  - Nút "💬 Hỏi về tài liệu này" nằm cố định trên trình đọc. Lỗi cũ: nút này bị cuộn che mất.
  - Ảnh trang có đổ bóng.
  - Nút chuyển "Trang gốc / Văn bản" dạng segmented.
- **Trang quản lý:**
  - Bảng có tiêu đề cột viết hoa nhỏ và hover dòng.
  - Nhãn trạng thái có màu (xanh = đã phát hành, vàng = cần xem, đỏ = lỗi).
  - Cột thao tác thẳng hàng.
  - Dòng tiến độ embedding (D-34) chỉ hiện ở bản Draft / NeedsReview / PendingApproval / Failed. Lỗi cũ: dòng này hiện cả ở bản Lưu trữ.

## Ghi chú

- `next dev` tự tạo `frontend/CLAUDE.md` và `frontend/AGENTS.md` (ghi chú của Next.js 16 cho agent), không phải tôi viết.
- Playwright MCP không chạy được vì máy chưa cài Chrome; tôi chụp bằng Edge có sẵn trên máy.
- Chưa kiểm tra kỹ trên màn hình điện thoại (mới có CSS responsive cơ bản).
