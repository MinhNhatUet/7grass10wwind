# 84 — Lộ trình: chế độ "Học đến ngày" (D-81)

## Yêu cầu
Người dùng chọn 15/10 ở chế độ "Chọn ngày trên lịch" và nhận lộ trình chỉ có 1 buổi. Người dùng muốn: "chọn học đến ngày đó". Liên quan FR-03, D-46.

## Đã làm
- `frontend/src/app/(main)/learning/plans/page.tsx`:
  - thêm chế độ "Học đến ngày": ô chọn ngày có sẵn của trình duyệt, cho chọn từ hôm nay đến tối đa +59 ngày;
  - frontend tự tạo danh sách ngày từ hôm nay đến hạn rồi gửi qua `dates` (backend có sẵn);
  - nội dung lời nhắc gửi đi: "mỗi ngày từ dd/mm đến dd/mm (n ngày)";
  - đổi tên chế độ cũ thành "Chọn từng ngày".
- Không đổi backend.

## Kiểm tra
- `npx tsc --noEmit`, eslint file: sạch.
- Thử trên Edge với server dev (không bấm tạo, không ghi DB): chọn 15/10 → "Học mỗi ngày từ hôm nay (03/10) đến 15/10 — 13 ngày"; min/max ô ngày là 2026-10-03 / 2026-12-01; không có lỗi console.

## Còn lại
- Chưa commit.
- Chưa có tùy chọn bỏ thứ 7 / chủ nhật (chưa ai yêu cầu).
