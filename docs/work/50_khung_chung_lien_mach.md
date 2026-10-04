# 50 — Giao diện liền mạch: khung chung cho các trang học tập

**Yêu cầu:** "bạn có thể làm các tính năng của frontend nhìn liền mạch không làm các trang tách rời rất khó sử dụng". **Quyết định:** D-54.

## Trước khi sửa
Mỗi trang một khung riêng:
- Chat: thanh bên ChatGPT kèm lịch sử.
- Thư viện: `<aside>` riêng, breadcrumb, "Về Chat AI".
- Learning: nút "Quay lại chat".
- Lộ trình: header breadcrumb và nút quay lại.

Chuyển trang giống như nhảy sang ứng dụng khác.

## Thay đổi
- `components/main-shell.tsx` (`MainShell`):
  - thanh bên cố định 260px: Chat mới (`/?new=`), điều hướng theo vai trò có tô mục đang mở ("Hỏi đáp", "Tài liệu học tập", "Ôn tập & đề kiểm tra" / "Soạn đề trắc nghiệm", "Lộ trình học", "Không gian làm việc" / "Quản trị");
  - "Gần đây": mở hội thoại `/?conv=`, đổi tên, xoá, "Xoá tất cả" (`DELETE /conversations`);
  - tài khoản, sáng/tối, đăng xuất;
  - thu gọn được (nhớ trong `localStorage`); điện thoại: mặc định đóng, mở dạng lớp phủ, chọn mục thì tự đóng; khi đóng, nút mở nằm trên một thanh mảnh, không đè nội dung;
  - sự kiện `CONV_CHANGED` (tải lại lịch sử) và `ACTIVE_CONV` (tô hội thoại đang mở).
- `app/(main)/layout.tsx` bọc `MainShell`. Chuyển `page.tsx`, `library/`, `learning/` (cả `plans/`) vào `(main)`, URL không đổi; import tương đối đổi sang `@/`.
- Trang chat:
  - bỏ thanh bên, state / hàm lịch sử, đổi tên / xoá và thanh "Chat | Tài liệu | Lộ trình";
  - đọc URL bằng `useSearchParams` (`conv`, `new`, `q`, `document`) nên đổi hội thoại không tải lại trang; bọc `Suspense`;
  - báo thanh bên khi tạo hội thoại / nhận câu trả lời; bỏ `MOCK_HISTORY` và import thừa (ESLint trang chat còn 3 `any` + `location` có sẵn).
- Thư viện / Learning / Lộ trình: bỏ thanh bên, header, nút quay lại riêng; mỗi trang tự cuộn trong khung (`h-full overflow-y-auto`). Tiêu đề Learning theo vai trò ("Ôn tập & đề kiểm tra" / "Soạn đề & học tập").
- Hồ sơ, `/hub`, `/admin` giữ khung riêng (khu vực theo vai trò).

## Kiểm tra (Edge headless ở cổng 3000, `sinhvien`)
- Chuyển Hỏi đáp → Tài liệu → Ôn tập → Lộ trình → Hỏi đáp: thanh bên **không bị dựng lại** (dấu DOM còn nguyên), mục đang chọn đúng từng trang.
- Đang ở Thư viện, bấm hội thoại "mô hình thác nước" trong "Gần đây" → sang chat, hiện đúng tin nhắn. "Chat mới" → màn hình trống.
- Thư viện "Hỏi AI" → chat ở phạm vi tài liệu ("Đang hỏi đáp trong tài liệu").
- Ôn tập Bài 3 → Flashcard 5 thẻ → sang chat sau 162 ms, có thẻ flashcard, lịch sử thanh bên tăng (2 → 3).
- Thu gọn thanh bên trên máy tính: nút mở nằm trên tiêu đề, không đè.
- Điện thoại 390px: thanh bên đóng sẵn; mở ra là lớp phủ; chọn "Lộ trình học" thì tự đóng.
- `tsc` sạch; `next build` OK (route `/`, `/library`, `/learning`, `/learning/plans` giữ nguyên).
