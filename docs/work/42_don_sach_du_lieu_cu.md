# 42 — Dọn sạch dữ liệu dev cũ, chỉ còn môn SE101

**Yêu cầu:**
- "bạn lưu các data cũ vào folder backup nằm ở P-134 và cho vào git ignore";
- "r bạn xóa ở phần data đi";
- "tôi muốn sạch hẳn".

**Quyết định:** D-48.

## Sao lưu (`backup/`, đã thêm vào `.gitignore`)
- `db/`: 26/09, 30/09 (trước khi xử lý lại sách), 01/10 (trước khi nạp CNPM), 01/10 (trước khi dọn sạch).
- `work_logs/` (01–34), `data_2026-09-29/`, `dev_books/` (sách dev + `manifest.books.json` + `manifest_report.md`), `storage_cu/` (8 file, 18 MB), `fixtures_demo_cu.json`, `fixtures_local_cu.json`, `env_before_cnpm.bak`.
- Kiểm tra trước khi xoá: sha256 30/30 file `data/raw/books` khớp với `backup/dev_books`; mỗi file storage được chép và so kích thước trước khi xoá.

## Xoá
- `data/raw/`.
- DB (script một lần, có bước chạy thử trước, rồi `--apply`):
  - 3 môn COURSE-01..03; 8 tài liệu, 14 bản, 2.950 chunk, 31 job, 14 duyệt;
  - 3 đề, 7 lộ trình, 89 hội thoại, 222 tin nhắn, 241 trích dẫn, 2 feedback;
  - 19 quyền môn, 34 idempotency, 118 usage, 13 tài khoản;
  - sau đó `VACUUM`: `app.db` còn 772 KB.
- **Giữ:** audit 240 dòng (BR-11); 4 tài khoản `sinhvien` / `giangvien` / `quantri` / `kiemduyet01`; môn SE101 với 15 tài liệu và 76 chunk có embedding.
- `data/storage`: xoá 8 file không còn bản nào trỏ tới (đã chép vào `backup/storage_cu`), còn 15 file CNPM.
- `.env`: bỏ 10 dòng `DEMO_SINHVIEN01/02`, `GIANGVIEN01/02`, `ADMIN01`.

## Cho các công cụ không còn trỏ vào dữ liệu đã xoá
- `seed_cnpm.py`: thêm `write_manifest()` ghi `data/manifest.cnpm.json` (môn SE101 status `confirmed`, 15 nguồn: sha256, số trang, `storage_ref` `data/artifacts/pdf/…`, xác nhận demo); cờ `--manifest-only`.
- `eval/config.json`: `manifest_path` → `data/manifest.cnpm.json`; `holdout.course_allocation` → `{"SE101": 100}`.
- `data/eval/fixtures/demo.json`, `local.json`: 4 tài khoản CNPM (đọc `$ENV:DEMO_CNPM_*`, `DEMO_KIEMDUYET01_*`).
- `scripts/import_books.py`: manifest mặc định → `data/manifest.cnpm.json`; sửa chú thích `validate_manifest.py`, `eval/schemas.py`.
- Tài liệu: `docs/handover/huong_dan_chay.md` (mục seed + tài khoản), `docs/documentions/mo_ta_du_an_hien_tai.md`.

## Kiểm tra
- `validate_manifest.py`: 0 ERROR (37 WARNING: chỉ thiếu các loại tài liệu mẫu để kiểm thử, như PDF scan / file lỗi / 2 phiên bản).
- `seed_users.py --fixtures demo` → "Đã seed 1 môn, 4 tài khoản"; quyền môn đúng (sinhvien / giangvien / kiemduyet01 → SE101, quantri → không môn).
- ruff sạch ở các file đã sửa. Lỗi ruff còn lại thuộc các script có sẵn (`log_hook`, `seed_courses`, …), CI chỉ chạy ruff trên `src/` và `tests/`.
- Chưa đụng `scripts/seed_courses.py` (của TV4, nếu chạy sẽ tạo lại 3 môn mẫu).
