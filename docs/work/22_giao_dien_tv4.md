# 22 — Lấy giao diện của nhánh TV4 (D-36)

- **Ngày:** 28/09/2026
- **Yêu cầu:** "merge lấy giao diện thôi". Tức là lấy phong cách giao diện của nhánh `origin/integration/frontend-backend`, còn logic, API và tính năng giữ bản hiện tại.
- **Kết quả:** hoàn thành. Tôi chụp màn hình thật để so với bản TV4 (chạy TV4 từ một git worktree tạm, đã xóa). `npm run typecheck` và `npm run build` pass.

## Cách làm

- Checkout nhánh TV4 (commit mới nhất `2aff529`) vào worktree tạm, chạy ở cổng 3200 với backend test 8100, chụp các trang `/`, `/login`, `/hub`, `/hub/manage`, `/dashboard`.
- Đọc token của TV4: shadcn "neutral" (nền `#fff`, chữ `#0a0a0a`, primary `#171717`, viền `#e5e5e5`, bo 10px), font Inter, có chế độ tối.
- Dựng lại bằng CSS (`theme.css` viết lại toàn bộ) và sửa markup của các component hiện có. Không cài Tailwind/shadcn và không chép code trang TV4, vì các trang đó dùng dữ liệu mẫu và thiếu tính năng của bản này.

## Thay đổi

- **`AppShell`:**
  - Bỏ header trên cùng, chuyển sang sidebar trái: logo, "Chat mới", các mục điều hướng có icon SVG theo quyền, ô chọn môn, vùng riêng của trang (`side`), tài khoản (link tới `/profile`), nút sáng/tối (lưu `localStorage`, có try/catch), nút đăng xuất.
  - Màn hẹp: sidebar trượt ra từ nút ☰.
- **Chat:**
  - Lịch sử chuyển vào sidebar (mục "Gần đây"); giữ nguyên phân trang, xóa tất cả và xóa từng hội thoại.
  - Có nút chuyển Chat | Tài liệu.
  - Khi trống: "Bạn đã sẵn sàng chưa?" với ô nhập giữa màn, gợi ý nhanh dạng chip bên dưới.
  - Ô nhập dạng viên thuốc, nút gửi tròn mũi tên, dòng lưu ý "EDU-04 có thể mắc lỗi…".
  - Tin nhắn người dùng là bong bóng xám; câu trả lời không khung.
  - Panel nguồn chỉ hiện khi mở trích dẫn.
- **Đăng nhập:** "Chào mừng trở lại!" font serif, ô nhập và nút tối bo tròn, link "Chưa có tài khoản? Đăng ký ngay" để chuyển sang đăng ký.
- **Thư viện:** 3 cột, gồm danh sách (bấm cả mục để đọc), trình đọc (thêm zoom 50–200%), và panel thông tin (loại, phiên bản, số trang, ngày phát hành, nút "Hỏi về tài liệu này").
- Các trang quản lý, quản trị và hồ sơ dùng chung token mới.

## Không lấy từ TV4

- Nút "Đăng nhập với Google": backend không có OAuth, đưa vào thì chỉ là nút trang trí.
- Dải thumbnail trang của trình xem: mỗi thumbnail là một lần render PDF phía server, tốn tài nguyên. Chưa cần.
- Nội dung mẫu (`Slide_Chuong_1_AI.pdf`), panel "Thiết kế/typography", nút Chia sẻ, Thu hồi trong trình xem sinh viên.

## Ghi chú

- Người dùng đang chạy `next dev` ở cổng 3000, và Next.js không cho mở bản dev thứ hai trong cùng thư mục. Tôi chụp màn hình qua server đó (chỉ đọc) và không tắt nó. Server test của tôi (3200, 8100) đã tắt sau khi chụp.
- Chưa kiểm tra kỹ trên điện thoại.

## Bổ sung: trình đọc "Vừa khung"

- **Phản hồi:** "tài liệu vừa có cuộn vừa có lướt sang để xem". Ảnh trang được vẽ theo bề rộng khung nên cao hơn khung, phải cuộn dọc; khi zoom thì cuộn thêm cả chiều ngang.
- **Sửa:** chế độ Trang gốc mặc định là **"Vừa khung"** (`zoom = 0`). Ảnh co vừa cả chiều rộng lẫn chiều cao khung (`max-width` / `max-height: 100%`, `object-fit: contain`), khung không cuộn. Nút + chuyển sang 100% → 125% → … → 200%, và chỉ khi đó mới cuộn. Nút − từ 100% quay về "Vừa khung".
- **Kiểm tra:** đo bằng Edge headless ở màn 1440×900 và 1024×720, không phần tử nào còn cuộn. `npm run typecheck` pass.

## Bổ sung 2: đọc bằng cách cuộn liên tục (thay "Vừa khung")

- **Phản hồi:** "ko cuộn để đọc tài liệu được". Chế độ "Vừa khung" chỉ hiện một trang nên không cuộn được để đọc tiếp.
- **Sửa (`SourceReader`):**
  - Cả hai chế độ Trang gốc và Văn bản đều **cuộn dọc liên tục**. Ảnh trang vừa chiều ngang khung (`overflow-x: hidden`); chỉ khi phóng to trên 100% mới được cuộn ngang.
  - Cuộn tới gần cuối thì **tự tải thêm** 2 trang. Vẫn có nút "↓ Tải thêm trang" và "↑ Đọc trang trước".
  - Ô số trang tự đổi theo trang đang ở đầu khung (không ghi đè khi người dùng đang gõ).
  - Nhảy trang (‹ ›, ← →, nhập số) cuộn tức thì tới trang đích. Nếu nhảy xa thì tải lại cửa sổ trang rồi cuộn khi trang đã có trong DOM (`pendingScroll`).
  - Cuộn tới đoạn trích chỉ **một lần** cho mỗi nguồn. Trước đây mỗi lần tải thêm trang lại kéo người đọc về đoạn trích.
- **Lỗi tìm được khi test:** khung chờ ảnh dùng class `.skeleton` có `height: 64px`, lấn át `aspect-ratio`. Trang mới tải chỉ cao 64px nên lệnh cuộn tới trang đích không có chỗ để cuộn. Đã sửa: `.skeleton.page-skeleton { height: auto; aspect-ratio: 8.5/11 }`.
- **Kiểm tra (Edge headless, 1440×900, qua server 3000 của người dùng, chỉ đọc):**
  - Lăn chuột 12 lần: số trang tải tăng từ 2 lên 14, ô số trang đổi 1 → 12, không cuộn ngang.
  - Nhập "40" rồi Enter: khung cuộn tới đúng trang 40 (`scrollTop` 766, trang 40 ở vị trí 888 so với đầu khung).
  - `npm run typecheck` pass.
