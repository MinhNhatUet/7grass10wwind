# 79 — Phân công cải tiến cho 4 thành viên

## Yêu cầu
Viết file phân công công việc cải tiến cho 4 thành viên:
- Việt: OCR, chunking, dữ liệu;
- Nhật và Hùng: backend;
- Bình: frontend.

Chia quyền sở hữu file để không ai đụng file của người khác; chốt phần dùng chung và cấu trúc thư mục. Liên quan PRD v2 §7, BL-30.

## Đã làm
- Tạo `docs/documentions/phan_cong_cai_tien_edu04.md`:
  - việc cải tiến của từng người, gồm mã việc (V-, N-, H-, B-), mã PRD v2 và mức ưu tiên;
  - bảng phụ thuộc giữa các việc;
  - quyền sở hữu từng file / thư mục;
  - quy trình sửa file dùng chung;
  - hợp đồng chunk và hợp đồng API;
  - cấu trúc thư mục;
  - quy trình Git và thứ tự làm.
- Chia backend:
  - Nhật: AI, gồm agents, assistants, retrieval, policy, llm và eval;
  - Hùng: nền tảng, gồm api, auth, acl, documents, conversations, course_quiz, usage, DB và Docker;
  - Việt: ingestion, text_cleaning, page_render.
- Thêm dòng mục lục trong `docs/README.md`.

## Mục ghi "cần chốt" (chờ nhóm xác nhận)
- Dải số decision log riêng cho từng người.
- Thư mục mới `data_pipeline/`.
- Định dạng sự kiện SSE.
- Kích thước chunk mục tiêu.
- Đổi nhánh tích hợp `ndmnhat` → `develop`.

## Kiểm tra
- Dò liên kết Markdown: 0 liên kết hỏng.
- Các tên file, hàm và trường dữ liệu trong bảng đã đối chiếu với code: danh sách file `src/`, `frontend/src/`, `scripts/`, model `Chunk`, `import_prechunked`, định dạng `data/artifacts/chunks/ver_*.json`, định dạng lỗi trong `main.py`.

## Còn lại
- Chưa commit (chờ người dùng).
- `.github/CODEOWNERS` là file template của ban tổ chức nên không sửa. Quyền sở hữu file trong tài liệu là quy ước của nhóm, GitHub không tự kiểm.
