# 32 — Dọn file theo `docs/file-cleanup-review-2026-09-30.md` (phần rủi ro thấp)

**Yêu cầu:** người dùng đồng ý làm 3 bước rủi ro thấp mà mình đề xuất sau khi đọc báo cáo review.

## Đã làm
1. `git rm` 6 asset mẫu không nơi nào dùng: `frontend/public/{file,globe,next,vercel,window}.svg`, `hrment-logo.png`. Đã grep `frontend/src`, `src`, `tests`, `scripts`, `.github` trước khi xoá. File vẫn khôi phục được từ lịch sử git.
2. `git rm --cached frontend/tsconfig.tsbuildinfo`: bỏ khỏi Git tracking, file vẫn còn trên máy và đã bị ignore (`frontend/.gitignore:40`).
3. Cấu hình URL backend cho khớp code (`lib/api-errors.ts` đọc `NEXT_PUBLIC_API_URL`, không có rewrite):
   - `frontend/.env.example`: `BACKEND_URL` → `NEXT_PUBLIC_API_URL=http://localhost:8000`, ghi chú biến được gắn lúc build.
   - `frontend/.env.local` (không commit): đổi tên biến tương tự, giá trị giữ nguyên.
   - `docs/handover/huong_dan_chay.md`: 3 chỗ nhắc `BACKEND_URL` → `NEXT_PUBLIC_API_URL`.

## Chưa làm (theo đề xuất)
- `frontend/luno-admin-dashboard/`, `paper-document-editor/`, `transform.js`: code của TV4, chờ TV4 xác nhận.
- Nhóm backend mẫu (`routes.py`, `graph.py`, `state.py`, `example_node.py`, `example_tool.py`): cần sửa `src/main.py` và test, sẽ làm thành một thay đổi riêng.
- `docs/guide/`: thuộc CODEOWNERS bên ngoài, không được sửa hay xoá (CLAUDE.md).

## Kiểm tra
- `next build` OK. Chưa commit.

## Bổ sung: dọn `docs/work/` + mô tả dự án
- Theo yêu cầu người dùng, xoá log 01–29 trong `docs/work/`, chỉ giữ 3 log mới nhất (30, 31, 32).
  - 01–24 đã được track: xoá bằng `git rm`, lấy lại được từ lịch sử git.
  - 25–29 chưa từng commit: trước khi xoá đã chép bản sao vào scratchpad của phiên (thư mục tạm, không bền lâu).
- Viết `docs/documentions/mo_ta_du_an_hien_tai.md`: mô tả trạng thái mã nguồn hiện tại (chức năng, vai trò/tài khoản demo, kiến trúc, luồng câu hỏi/tài liệu, BR enforce ở server, bảng dữ liệu, API, trang frontend, cách chạy, hạn chế). Số liệu môn, tài liệu, tài khoản lấy từ `data/app.db` (chỉ đọc); không ghi mật khẩu.
