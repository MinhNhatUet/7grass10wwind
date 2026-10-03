# 41 — Demo môn Công nghệ phần mềm từ dữ liệu thật (`data/artifacts`)

**Yêu cầu:**
- "data thật đang ở D:\P-134\data\artifacts nên bạn khớp theo data đó";
- "tôi đã đẩy pdf của môn cnpm vào pdf";
- "giờ chỉ demo với môn cnpm thôi… 1 tk học sinh, 1 tk giảng viên, 1 tk admin";
- "dùng chunk đi".

**Quyết định:** D-47.

## Dữ liệu
- `data/artifacts` là output pipeline MinerU (`ingestion_v1`) của 83 tài liệu, 9 môn. Không có embedding.
- SE101: 15 file chunk (78 chunk). PDF gốc trong `data/artifacts/pdf`: 15/15 khớp sha256 với `inventory.jsonl` (`02_SE intro2.pdf` được người dùng bổ sung trong lúc làm).
- Metadata: quyền `unknown`, `ai_processing_allowed=false`, ACL rỗng → người dùng xác nhận dùng cho demo.

## Thực hiện
- `scripts/seed_cnpm.py` (mới):
  - môn SE101;
  - 3 tài khoản `sinhvien` / `giangvien` / `quantri`, mật khẩu ngẫu nhiên ghi `.env` (`DEMO_CNPM_*`);
  - thêm quyền duyệt SE101 cho `kiemduyet01`;
  - với mỗi PDF: upload (giảng viên) → trích xuất → **thay chunk bằng chunk artifacts** (đã làm sạch) → submit → duyệt (`kiemduyet01`) → index (embedding) → Published;
  - `EMBED_ON_UPLOAD=false` trong tiến trình script; `--reset` gỡ bản SE101 cũ (chặn nếu đã có trích dẫn).
- Lần chạy đầu (chunk của app) bị người dùng dừng giữa chừng: 7 bản Published + 1 kẹt Indexing. Lần hai `--reset` đã gỡ 8 bản đó (không có trích dẫn hay hội thoại nào trỏ tới; file storage giữ nguyên).
- Kết quả: 15/15 Published, 76 chunk, 76/76 có embedding.
- Sao lưu trước khi chạy (scratchpad của phiên): `app_before_cnpm.db`, `env_before_cnpm.bak`.
- `api/quizzes.py`: tài liệu `doc_type=slide` → một "Bài":
  - tên lấy từ trang bìa (chunk đầu, bỏ dòng tên môn / "Chapter N" / tiền tố "Bài 05:");
  - mục con lấy từ gạch đầu dòng của slide "Nội dung", không có thì lấy tiêu đề slide trong mục lục PDF;
  - số bài lấy theo tên file; `kind: "lesson"`.
- `learning-hub.tsx`: nhãn "Bài N" cho bài giảng slide (giữ "Chương N" cho sách).

## Kiểm tra (TestClient trên bản sao DB)
- 3 tài khoản đăng nhập đúng vai trò. Sinh viên chỉ thấy "Công nghệ phần mềm", thư viện 15 tài liệu.
- Hỏi "Mô hình thác nước là gì, ưu nhược điểm?" → 200 sau 13 giây, academic, trích "03-process models".
- Danh sách ôn tập: 15 bài, ví dụ "Bài 3 · Tiến trình và mô hình tiến trình phần mềm", "Bài 13 · Một số phương pháp kiểm thử cơ bản".
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning-hub.tsx`.

## Còn mở
- 8 môn còn lại trong artifacts chưa nạp (chưa có PDF gốc).
- Chunk artifacts lớn (khoảng 2.000 ký tự, gom nhiều trang) nên trích dẫn chỉ trỏ trang bắt đầu của chunk.

## Bổ sung: sao lưu dữ liệu cũ vào `backup/` (gitignore)
- Theo yêu cầu "lưu các data cũ vào folder backup nằm ở P-134 và cho vào git ignore". Chỉ **chép**, không di chuyển; app và script vẫn dùng `data/` như cũ.
- `backup/db/`:
  - `app_2026-09-26.db`;
  - `app_2026-09-30_truoc_xu_ly_lai_sach.db`;
  - `app_2026-10-01_truoc_nap_cnpm.db`.
- `backup/work_logs/`: nhật ký 01–34 (bản chép trước khi dọn `docs/work`).
- `backup/data_2026-09-29/`: bản chụp `data/` ngày 29/09.
- `backup/dev_books/`: sách dev COURSE-01..03 + `manifest.books.json`.
- `backup/env_before_cnpm.bak`: `.env` trước khi thêm tài khoản CNPM (có bí mật, chỉ để trên máy).
- `.gitignore` thêm `backup/`; `git check-ignore` xác nhận các file trong đó bị bỏ qua.
- Theo "r bạn xóa ở phần data đi": đối chiếu sha256 30/30 file giữa `data/raw/books` và `backup/dev_books` (khớp hết), chép thêm `data/raw/manifest_report.md` vào `backup/dev_books/`, rồi xoá `data/raw/` (sách dev + manifest).
- `data/` còn: `app.db`, `artifacts/` (dữ liệu thật), `auth/`, `eval/`, `storage/`.
- Ảnh hưởng: `scripts/seed_users.py`, `import_books.py`, `reprocess_books.py`, `validate_manifest.py` và `eval/config.json` (`manifest_path`) vẫn trỏ `data/raw/books/manifest.books.json`, nên sẽ báo không tìm thấy manifest. Demo CNPM dùng `scripts/seed_cnpm.py`, không cần manifest. Sách dev COURSE-01..03 đã phát hành vẫn còn trong `app.db` và `data/storage` (chưa xoá).
