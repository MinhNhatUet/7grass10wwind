# 37 — Sửa / xoá lộ trình học, kiểm tra tính năng ôn tập

**Yêu cầu:** "cho xóa lộ trình học và có thể chỉnh sửa lộ trình và hiện tại các tính năng ôn tập ko dùng đc". **Quyết định:** D-43.

## Chẩn đoán "ôn tập không dùng được"
- Qua API (8000, sinhvien01), backend chạy đúng: trắc nghiệm theo chủ đề 200 trong 9 giây; flashcard theo buổi lộ trình 200 trong 8 giây.
- Qua trình duyệt ở cổng 3000, các thao tác sau đều chạy đúng:
  - chủ đề → trắc nghiệm (chọn đáp án hiện đúng/sai + dẫn chứng);
  - lộ trình → flashcard;
  - điền khuyết → "Kiểm tra" hiện dẫn chứng;
  - tự luận có ô trả lời và nút "Gửi để đánh giá".
- Nguyên nhân tìm được:
  1. Nút "📝 Ôn tập" chỉ hiện khi lộ trình đã xác nhận. Lộ trình mới tạo (Draft), đã huỷ hoặc đã xong không có nút.
  2. LLM vilao chập chờn (log 33): có lượt mất 125 giây hoặc báo 503.
  3. Sau khi xử lý lại sách (log 36), các buổi của lộ trình cũ bị làm mờ, kèm cảnh báo "Nguồn đã thay đổi — cần cập nhật" (vẫn bấm được).
- Sửa: nút Ôn tập hiện ở mọi trạng thái. Server chỉ kiểm tra chủ sở hữu, môn lấy từ lộ trình (D-37).

## Sửa / xoá
- Backend:
  - `update_plan`, `delete_plan` (`services/conversations.py`);
  - `PUT` / `DELETE /learning/plans/{id}` (`api/conversations.py`, kiểm tra bằng pydantic);
  - audit `plan_edit` / `plan_delete`.
- Frontend `learning-cards.tsx`:
  - `PlanCard` có nút "✏️ Sửa" và "🗑 Xoá" (hỏi xác nhận);
  - `PlanEditor` sửa mục tiêu và từng buổi (ngày, phút, tên, mục tiêu, hoạt động, tự kiểm tra), "Xoá buổi", "+ Thêm buổi".
- `learning-hub.tsx`: `MyPlans` truyền `onDeleted` (đóng thẻ, tải lại danh sách). Trong chat, xoá xong thì tải lại hội thoại và thẻ lộ trình biến mất.

## Kiểm tra (8100 / 3100, bản sao DB)
- sinhvien02 sửa hoặc xoá lộ trình của sinhvien01 → 404; gửi `sessions` rỗng → 422.
- UI:
  - đổi mục tiêu, sửa tên buổi 1, xoá buổi cuối, thêm "Buổi tự thêm" → lưu xong hiện đúng, 7 nút Ôn tập;
  - Xoá → số lộ trình 1 → 0; GET lộ trình vừa xoá → 404.
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning-cards.tsx`, `learning-hub.tsx`.
- Đã tắt server test, xoá bản sao DB, build lại với backend mặc định. Backend 8000 đã tự reload (có route PUT).
