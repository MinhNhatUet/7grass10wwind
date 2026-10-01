# 39 — Tạo bài ôn tập / lộ trình: chuyển sang chat ngay

**Yêu cầu:** "khi tạo thì nó điều hướng luôn chứ ko đứng ở đó trông rất sốt ruột". **Quyết định:** D-45.

## Trước khi sửa
Trang Learning (ôn tập theo chương), thẻ lộ trình (ôn tập buổi) và trang Lộ trình (tạo lộ trình) đều gọi API rồi **chờ LLM trả lời** mới chuyển trang. Có lượt phải chờ 10–130 giây, suốt lúc đó chỉ thấy dòng "Đang tạo…".

## Thay đổi
- `learning-hub.tsx`:
  - `goToChat(router, content, body, courseId?)` lưu yêu cầu vào `sessionStorage[PENDING_SEND]` rồi `router.push("/?pending=1")`;
  - bỏ `startLearningChat`, `practiceInChat`, `practice` và các trạng thái `working`;
  - `MyPlans` bỏ props `reloadKey` / `openId`.
- `learning-cards.tsx`: thêm hằng `PENDING_SEND`, dùng chung cho hub và chat.
- `app/learning/plans/page.tsx`: tạo lộ trình gọi `goToChat` (thẻ lộ trình hiện trong chat). Bỏ `creating` / `notice` / `reloadKey` / `openId` và import thừa.
- `app/page.tsx`:
  - thêm `useEffect` riêng (đặt sau `handleSend`): có `?pending=1` thì đọc và **xoá** yêu cầu, rồi `handleSend(undefined, {content, body, courseId})`;
  - `handleSend` nhận `courseId` và tạo hội thoại kèm `course_id`.
  - ESLint `page.tsx` vẫn đúng 8 lỗi sẵn có của TV4, không thêm lỗi mới.

## Kiểm tra (Edge headless, cổng 3000, sinhvien01)
- Ôn tập Chương 5 · Graph Theory, Flashcard 5 thẻ:
  - 270 ms sau khi bấm đã ở chat, thấy tin nhắn "Ôn tập Chương 5: Graph Theory — Flashcard, 5 câu" và dấu "…" đang trả lời;
  - thẻ flashcard hiện sau khoảng 9,8 giây; chỉ 1 request POST `/messages`.
- Tạo lộ trình "Đồ thị Euler và Hamilton", 3 ngày:
  - 216 ms sau khi bấm đã ở chat;
  - lộ trình và nút "Xác nhận kế hoạch" hiện sau khoảng 130 giây (LLM vilao chậm); 1 request POST.
- `tsc` sạch; ESLint sạch ở `learning-hub.tsx`, `learning-cards.tsx`, `learning/plans/page.tsx`.
- Dữ liệu tạo trong lúc thử nằm trong tài khoản sinhvien01: vài hội thoại ôn tập và lộ trình Draft "Đồ thị Euler và Hamilton".
