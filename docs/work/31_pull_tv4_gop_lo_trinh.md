# 31 — Pull code nhánh TV4 (f57119b) + gộp trang Lộ trình học

**Yêu cầu:** "pull code từ nhánh fe be về", sau đó "có chứ và gộp lại": thêm lại link cho giảng viên và gộp phần lộ trình.
**Quyết định:** D-39.

## Pull
- `git fetch` → `origin/integration/frontend-backend` có 1 commit mới `f57119b` (TV4). Commit này sửa admin (management/monitoring/quota + `admin-shell`), hồ sơ, thư viện (`scroll-document-reader`, `library.css`), sidebar chat (menu hồ sơ/đăng xuất, khung "Đang hỏi đáp trong tài liệu") và thêm `/learning/plans`.
- Các bước: stash phần chưa commit → `git merge` (tạo commit merge) → `stash pop`.
  - `app/page.tsx` tự gộp được.
  - `learning/page.tsx` xung đột (TV4 chỉ đổi màu mockup cũ). Giữ bản trang thật của mình.
- Bản stash `pre-merge f57119b` vẫn còn: lệnh xoá stash bị công cụ chặn, người dùng tự xoá khi thấy ổn.

## Gộp lộ trình
- `/learning/plans`: giữ bố cục TV4 (breadcrumb, tiêu đề, cột Hướng dẫn, form tạo), thay toàn bộ logic giả:
  - Danh sách lấy từ server (`GET /learning/plans`) thay vì id lưu trong `localStorage`. TV4 dùng field `topic` / `duration_minutes` / `Completed`, không khớp dữ liệu thật.
  - Mở lộ trình là `PlanCard`: xác nhận, đánh dấu buổi, ôn tập theo hình thức, Google Calendar, `.ics`.
  - Tạo lộ trình: hội thoại mới cố định môn, gửi `learning.action=plan` (goal/days/minutes_per_day). Nếu trợ lý hỏi lại thay vì tạo thì hiện nguyên văn kèm link mở hội thoại.
  - Tìm kiếm và lọc trạng thái chạy thật. Bỏ chuông, avatar "B", "Ctrl K" (chỉ để trang trí). Có chế độ tối.
- `learning-hub.tsx`:
  - Tách `MyPlans` và `startLearningChat` (dùng chung).
  - Trung tâm học bỏ mục "Lộ trình của tôi", thay bằng thẻ link "Mở lộ trình học →".
- Sidebar chat: giảng viên/người duyệt có link "Soạn đề trắc nghiệm" → `/learning` (Quiz Builder).
- `noCite` dọn thêm dấu phẩy thừa sau khi bỏ `[n]` ("khung, [1]." → "khung.").

## Kiểm tra
- `tsc` sạch. ESLint sạch ở `learning/plans/page.tsx`, `learning/page.tsx`, `learning-hub.tsx`.
- Edge headless trên bản sao DB (8100/3100):
  - Hub không còn mục trùng, có link sang lộ trình.
  - Trang lộ trình hiện đúng số lượng từ server.
  - Tạo "Cây khung và cây khung nhỏ nhất", 3 ngày: số lượng 1 → 2, lộ trình mới tự mở (3 buổi, cảnh báo thiếu nguồn, nút Xác nhận).
  - Lọc "zzzz" → báo không khớp.
  - giangvien01 thấy link "Soạn đề trắc nghiệm".
- Đã tắt server thử, xoá bản sao DB và build lại với backend mặc định. Chưa commit.

## Bổ sung: bỏ video nền chat
- Log dev báo `GET /assets/fastshot-bg.mp4 404`. File video bị `.gitignore` (`frontend/public/assets/*.mp4`, dòng 71) nên không có trên nhánh nào, chỉ có trên máy TV4.
- Người dùng chọn bỏ video: xoá khối `<video>` nền và CSS `ambientZoom`/`.ambient-zoom` trong `frontend/src/app/page.tsx`. Nền vẫn giữ gradient sáng/tối.
- `tsc` sạch, build OK. 8 lỗi ESLint còn lại ở `page.tsx` là code có sẵn của TV4.

## Bổ sung: video trang đăng nhập + `/v1/usage/current`
- `/login` cũng thiếu `/assets/login-left.mp4` (cùng lý do: bị `.gitignore`). Thay video bằng logo `vedu-logo.png` giữa khung trái, nền trắng.
- Log backend có `GET /v1/usage/current 404`: không có code nào trong repo (src, frontend/src, .next, scripts, hook .claude) gọi đường dẫn này, và frontend luôn gọi `/api/v1/...`. Nghĩa là một tiến trình khác trên máy gọi vào cổng 8000. Không ảnh hưởng ứng dụng.
- Kiểm tra trên cổng 3000 bằng Edge headless: đăng nhập sinhvien01 → vào chat; `/library`, `/learning`, `/learning/plans` đều hiển thị đúng.
