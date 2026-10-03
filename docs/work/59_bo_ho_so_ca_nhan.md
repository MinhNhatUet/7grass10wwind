# 59 — Bỏ trang hồ sơ cá nhân, chỉ hiện tên (D-62)

## Yêu cầu
"bỏ hồ sơ cá nhân đi chỉ cần tên thôi"

## Đã làm
- Xoá `frontend/src/app/profile/page.tsx` bằng `git rm`. Đây là trang tĩnh ~71 KB của nhánh TV4. Cùng lúc xoá `public/profile-avatar.png`, ảnh chỉ trang này dùng.
- `main-shell.tsx` (thanh bên học tập):
  - bỏ icon hồ sơ ở đầu thanh bên;
  - cuối thanh bên chỉ hiện **tên** người dùng; bỏ avatar, dòng vai trò và link `/profile`;
  - thêm `router` vào deps của effect (cảnh báo eslint sinh ra từ D-61).
- `admin-shell.tsx`: avatar "AD" (link `/profile`) đổi thành tên người đăng nhập, đọc từ `localStorage` sau hydrate.
- Gỡ các link `/profile` còn sót ở các khung cũ: `AppShell.tsx` (chip người dùng chỉ còn tên), `study-launcher.tsx`, `layout/Sidebar.tsx`. Đồng thời bỏ các import và biến không còn dùng.

## Kiểm tra
- `npx tsc --noEmit`: không lỗi trong `src`.
- `eslint` `main-shell.tsx`, `admin-shell.tsx`: không lỗi, không cảnh báo mới. Các lỗi `set-state-in-effect` ở `AppShell.tsx` và `layout/Sidebar.tsx` đã có từ trước, không phải do bước này.
- Không còn chỗ nào trong `src` tham chiếu `/profile` hay `profile-avatar`.
- Không đổi backend.

## Lưu ý
Chưa commit.
