# 49 — Merge nhánh `quanghung` (frontend + backend) có chọn lọc

**Yêu cầu:** "merge front end với back end đi". Người dùng chọn "Giữ tính năng, nhận phần mới". **Quyết định:** D-53.

## Phát hiện
- `quanghung` (f16fea8) tách từ `57ebbae`, đổi 72 file. Frontend được viết lại từ bản cũ:
  - chat ép `assistant: "academic"`;
  - bỏ thẻ học, KaTeX, ẩn nguồn / dẫn chứng, khoảng trang, `?conv=` / `?q=`, `pending`, link sidebar theo vai trò;
  - `learning/page.tsx` thành mockup tĩnh "QuizBuilderPage" (git tự gộp và lấy bản này).
- Trang thêm lại `/admin`, `/lecturer/*` import `useSession` / `useManagedCourse` / `VersionPreview`, các file này không có kể cả trên `quanghung` → không build được.
- Backend: `retention.py` xoá audit > 90 ngày (trái BR-11); thêm cột token vào `usage_events` nhưng không có migration.

## Xử lý
- Giữ bản `HEAD` cho `app/page.tsx`, `learning/page.tsx`, `library/page.tsx`, `profile/page.tsx`.
- `components/chat/ChatMessage.tsx` (giao diện của họ) bổ sung: `LearningCards`, KaTeX (`mathDelims` + plugin), `HIDE_SOURCE_KINDS` / `noCite`, "Trang a–b". `types/chat.ts` thêm `pageEnd`, `meta`. `page.tsx` dùng `<ChatMessage>`; trạng thái feedback chuyển vào component.
- `login/page.tsx` (giao diện của họ) sửa lại: login_id bất kỳ (`type="text"`, `trim`), bỏ video `login-left.mp4` thay bằng logo.
- Bỏ khỏi merge: `app/admin/page.tsx`, `app/lecturer/{dashboard,documents,review}/page.tsx`, `components/AppShell.tsx`.
- Backend:
  - `retention.py`: bỏ xoá audit, giữ dọn hội thoại xoá mềm > 30 ngày;
  - `db._migrate_usage_tokens()` thêm 3 cột (đã chạy trên DB thật).
- Nhận nguyên: `globals.css`, `layout.tsx`, `Dockerfile`, `package.json` (`gsap`, đã `npm install`), `errors.py` / `main.py` (`Retry-After`), `schemas.py`, `components/layout/*` (hiện chưa trang nào dùng), `.agents/*`, `skills-lock.json`, script hook.

## Kiểm tra
- `tsc` sạch. `next build` OK. ESLint không có lỗi mới (`page.tsx` còn 8 lỗi có sẵn, login 1 `any` có sẵn). ruff sạch. `pytest tests`: 27 passed.
- Edge headless ở cổng 3000:
  - đăng nhập bằng giao diện mới với `sinhvien` → vào chat;
  - hỏi "mô hình thác nước" → nhãn ACADEMIC ASSISTANT (router), nguồn "[1] 03-process models — Trang 4–6";
  - `/learning` (Trung tâm học thật), `/learning/plans`, `/library`, `/profile` hiển thị đúng.
- Dữ liệu thử: hội thoại "mô hình thác nước" trong tài khoản `sinhvien`.
- Commit merge ở local, **chưa push**.
