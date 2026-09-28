# 14 — Nút "Xóa tất cả" lịch sử chat

- **Ngày:** 26/09/2026
- **Yêu cầu:** "bạn thêm nút xóa tất cả lịch sử chat".
- **Liên quan:** FR-05.1, FR-05.7, AC-05.1, BR-02; UI-03.
- **Kết quả:** hoàn thành. Backend đã thử bằng API trên bản sao DB; giao diện đã typecheck và build, chưa xem bằng trình duyệt.

## Thay đổi

- **`DELETE /api/v1/conversations`** (bổ sung ngoài bảng PRD 11.2):
  - Xóa mềm (`deleted_at`) mọi hội thoại chưa xóa của user lấy từ token. Không nhận owner từ client (BR-02).
  - Trả `{"deleted": n}`.
  - Cùng chính sách với xóa từng hội thoại: ẩn ngay khi server xác nhận. Feedback, audit và kế hoạch học không bị xóa theo (FR-05.7: audit tách khỏi nội dung).
- **Service:** thêm `conversations.delete_all()`.
- **UI-03:** nút "Xóa tất cả" cạnh tiêu đề "Lịch sử của tôi".
  - Chỉ hiện khi có hội thoại.
  - Hỏi xác nhận kèm số hội thoại (FR-05.1: "xóa có xác nhận").
  - Xóa xong thì về màn hội thoại mới.

## Kiểm tra (kết quả thật, trên bản sao `data/app.db` để không mất lịch sử dev)

- SV1 có 40 hội thoại. `DELETE` trả 200 `{"deleted": 40}`, sau đó danh sách còn 0.
- SV2 vẫn giữ 1/1 hội thoại, tức không bị xóa của người khác.
- Gọi không kèm token → 401.
- DB thật vẫn còn nguyên 43 hội thoại.
- ruff pass; `npm run typecheck` và `npm run build` pass.

## Giới hạn

- MVP chỉ xóa mềm: dữ liệu vẫn nằm trong DB. Chưa có job dọn dữ liệu theo retention (PRD 12.4), giống hạn chế của chức năng xóa từng hội thoại.
