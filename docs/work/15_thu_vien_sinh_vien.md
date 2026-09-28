# 15 — Thư viện tài liệu cho Sinh viên

- **Ngày:** 26/09/2026
- **Yêu cầu:** "ở student có cho xem tài liệu" → tôi đề xuất thêm trang duyệt tài liệu → người dùng: "có chứ".
- **Liên quan:** FR-04.1–04.5, FR-10.6, BR-02, BR-03, BR-10; Wireframe UI-02 (khối "Tài liệu gần đây", đã bỏ theo D-28), UI-06.
- **Kết quả:** hoàn thành. Backend thử bằng API; giao diện đã typecheck và build, chưa xem bằng trình duyệt.

## Thay đổi (chỉ frontend, dùng lại API có sẵn)

- **Trang mới `frontend/src/app/library/page.tsx`**, menu **"Thư viện"**, hiện cho mọi vai trò trừ admin.
  - **Chọn môn:** dùng ô chọn môn ở header, chỉ gồm các môn server trả trong `/me/courses`. Môn trên URL mà không thuộc danh sách này thì bị bỏ qua.
  - **Danh sách:** lấy từ `GET /documents?course_id=`, chỉ gồm bản Published mà user được đọc. Mỗi dòng có tên, loại, phiên bản, chương, số trang và ngày phát hành.
  - **Tìm và lọc:** tìm theo tên, lọc theo loại tài liệu.
  - **Nút "Đọc":** mở trình đọc `SourceReader` (kiểu NotebookLM, log 12) từ trang 1. Có ô "Đến trang" để nhảy trang; khi đọc trang, server kiểm tra quyền lại mỗi lần.
  - **Nút "Tải bản gốc":** chỉ hiện khi `can_download`.
- **Nhãn loại tài liệu:** chuyển sang `DOC_TYPE_LABEL` trong `lib/messages.ts`, dùng chung với UI-07.
- Thêm kiểu `LibraryItem` (`lib/api.ts`) và CSS `.library-*`.

## Kiểm tra (kết quả thật, DB dev, chỉ đọc)

- SV môn 1:
  - thấy 1 tài liệu (bản Published của "An Introduction to Combinatorics and Graph Theory", 155 trang, không cho tải). Các bản Archived, PendingApproval và NeedsReview không hiện;
  - đọc trang 1–3 → 200 (trang 3 là mục lục đã lọc, nên hiện ghi chú);
  - tìm "graph" → 1 kết quả.
- SV môn 2 xem môn 1 → danh sách rỗng; đọc trang → 404 (không lộ tài liệu tồn tại).
- `npm run typecheck` và `npm run build` pass (có route `/library`).

## Giới hạn

- Tìm kiếm chỉ theo tên tài liệu, không theo nội dung. Muốn tìm theo nội dung thì dùng Knowledge Hub trong Hội thoại.
- Chưa có nút "Hỏi về tài liệu này" để mở Hội thoại kèm ngữ cảnh tài liệu, như wireframe UI-02 mô tả.
