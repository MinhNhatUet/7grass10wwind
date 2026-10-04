# 83 — Sửa theo báo cáo review code (D-79)

## Yêu cầu
"đọc file báo cáo review để cải thiện": `docs/bao_cao_review_code.md` (file chưa track; không rõ ai viết).

## Đã làm
- **Che 2 key thật** bị chép nguyên văn trong báo cáo (Gemini, `AI_LOG_API_KEY`). Kiểm tra: `.env` chưa từng có trong lịch sử git ở bất kỳ nhánh nào.
- Đối chiếu từng mục với code, rồi sửa: H-01, H-02, H-03, H-04, H-05, H-06 (một phần), M-01, M-03, M-04/P-04/P-05, M-05/P-01, L-03.
- Phát hiện thêm: các endpoint xác thực khai báo `async def` nhưng gọi đồng bộ (hash scrypt, DB) → đổi sang `def`. Sửa cách gọi trong `test_registration_cannot_choose_admin` cho phù hợp.
- Ghi bảng trạng thái xử lý vào cuối báo cáo; thêm D-79 vào decision log.

## Kiểm tra
- `ruff check` + `format --check` (src, tests): đạt. `pytest`: 156 passed.
- CORS: preflight hợp lệ 200; header lạ 400; origin lạ 400.
- Session / limiter: tự kiểm bằng assert (không tạo khóa khi chỉ hỏi; dọn khóa quá cửa sổ; dọn phiên hết hạn).
- `/admin/costs` và `/admin/audit`: so code cũ (HEAD) với code mới trên bản sao DB thật → giống hệt (45 lượt, 248 dòng audit).
- `docker compose config`: thiếu `POSTGRES_PASSWORD` thì báo lỗi; có mật khẩu thì chạy đúng.
- UAT toàn bộ `UAT_20261003_1730`: 16 / 0 / 22.

## Còn lại
- Chủ key thu hồi và cấp lại 2 key đã lộ trong báo cáo.
- Ai chạy Docker (Bình) phải đặt `POSTGRES_PASSWORD` trong `.env`. Volume cũ được tạo với mật khẩu `password`.
- Hoãn: Alembic / FK, async / stream, phiên bền vững, test mới, gói `cn`.
- Chưa commit.

## Đợt 2 (D-80): làm nốt toàn bộ báo cáo
Người dùng: "bạn sửa hết vì công việc của mn ở phần cải tiến cơ còn cái này vẫn thuộc của tôi".
- **M-09 / M-08:**
  - Alembic: `alembic.ini`, `migrations/`; 0001 là mốc (autogenerate từ model), 0002 là khóa ngoại `study_plans.course_id`;
  - `init_db`: DB cũ thì chạy `_migrate_*`, `stamp 0001`, rồi `upgrade`;
  - đã thử trên DB mới và bản sao DB thật: lên 0002, schema giống nhau, dữ liệu giữ nguyên (users 4, chunks 76, messages 93), chặn dòng mồ côi; `alembic check` không lệch;
  - backend `--reload` của người dùng đã tự migrate DB thật lên 0002.
- **M-07:** CSP có nonce qua `frontend/src/proxy.ts`; `layout.tsx` truyền nonce cho next-themes.
  - Thử bằng Edge (playwright-core trong scratchpad) trên build production, với backend riêng cổng 8200 dùng bản sao DB: đăng nhập demo, chat, ảnh trang (blob), iframe PDF của GV chạy được, 0 vi phạm CSP; HTML chèn `onerror` bị chặn.
  - Xong thì build lại `.next` với cấu hình chuẩn.
- **H-03 sửa lại:** `ThreadPoolExecutor` dùng thread không phải daemon nên tắt app phải chờ job → đổi sang daemon thread + `BoundedSemaphore`. Tự kiểm: 8 job thì tối đa 2 job chạy cùng lúc.
- **Các mục còn lại:** M-02, M-06, M-10, M-11 (kèm bỏ chromadb), M-12, L-01/02/07, L-04, L-05, L-08. L-06 không sửa (có lý do).
- **Kiểm tra:**
  - `ruff` đạt; `pytest` 156 passed, cả trên venv cài mới từ `requirements.txt`;
  - `tsc` sạch, lint 0 lỗi, build đạt;
  - UAT `UAT_20261003_1841`: 16 / 0 / 22.
- **Chờ người dùng quyết định:** test mới (mục 9, mâu thuẫn với R-08 giai đoạn MVP); TASK-P02 (response model cho mọi endpoint).
