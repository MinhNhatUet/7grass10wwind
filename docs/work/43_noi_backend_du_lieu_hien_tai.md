# 43 — Nối backend với dữ liệu hiện tại (SE101)

**Yêu cầu:** "nối backend với data hiện tại".

## Hiện trạng
- Backend 8000 và frontend 3000 đều đang tắt.
- Cấu hình đã trỏ đúng: `.env` `DATABASE_URL=sqlite:///./data/app.db` (DB đã dọn, chỉ còn SE101); `frontend/.env.local` `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Embedding Gemini 768 chiều (`EMBEDDING_*`), khớp với vector đã tạo khi nạp chunk artifacts (D-47). Không cần đổi code hay cấu hình.

## Làm
- Bật backend `uvicorn src.main:app --reload --port 8000` và frontend `next dev --port 3000` (chạy nền; log trong scratchpad của phiên).

## Kiểm tra (Edge headless + API, dữ liệu thật)
- `sinhvien`:
  - thư viện hiện môn "Công nghệ phần mềm", 15 tài liệu;
  - ảnh trang 1 của 15/15 tài liệu → 200 PNG (file gốc trong `data/storage`); text trang 1 đúng nội dung slide;
  - chat "So sánh kiểm thử hộp đen và hộp trắng" → có "Nguồn tham khảo" [1] [2] trỏ "12_Tong quan Testing" tr.17 và tr.8;
  - Learning & Quiz: 15 "Bài".
  - Hội thoại thử đã xoá ngay sau đó.
- `giangvien`: `/hub/manage` hiện các tài liệu "Đã phát hành", không có lỗi quyền.
- `quantri`: `/admin/management` hiện đúng 4 tài khoản (quantri, giangvien, kiemduyet01, sinhvien); `GET /admin/courses` → chỉ SE101.
