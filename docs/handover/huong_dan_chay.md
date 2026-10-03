# Hướng dẫn chạy EDU-04 (bản MVP)

Gồm **backend** FastAPI (cổng 8000) và **frontend** Next.js (cổng 3000). Frontend **gọi thẳng** backend qua `${NEXT_PUBLIC_API_URL}/api/v1` (không có proxy rewrite), nên backend phải cho phép origin của frontend qua `CORS_ORIGINS` (mặc định `http://localhost:3000`).

Phạm vi MVP và các điểm cần cải tiến: [PRD v2](../documentions/PRD_v2_MVP_edu04.md). Hiện trạng kỹ thuật: [mô tả dự án hiện tại](../documentions/mo_ta_du_an_hien_tai.md).

## 1. Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Python | **3.11 hoặc 3.12** | Không dùng 3.13/3.14: `ragas` cần `scikit-network`, gói này không build được trên 3.14 |
| Node.js | ≥ 20.9 (đã thử với 24.19) | npm đi kèm |
| Git | bất kỳ | |

## 2. Backend

```bash
# Tại gốc repo
py -3.12 -m venv .venv            # macOS/Linux: python3.12 -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

copy .env.example .env            # macOS/Linux: cp .env.example .env
```

Điền `.env`:

| Biến | Dùng cho |
|---|---|
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | LLM tương thích OpenAI (hiện dùng `gpt-4o-mini` qua vilao) |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `GEMINI_API_KEY` | Embedding (Gemini, 768 chiều) |
| `CORS_ORIGINS` | Origin của frontend, phân tách bằng dấu phẩy |
| `DEMO_LOGIN_ENABLED` | `true` để hiện nút **Đăng nhập demo** (chọn Sinh viên / Giảng viên, không cần mật khẩu). Luôn tắt khi `APP_ENV=production` (D-71) |
| `LLM_PRICE_INPUT_PER_1M`, `LLM_PRICE_OUTPUT_PER_1M`, `USD_TO_VND` | Ước tính chi phí AI ở trang Quản trị → Chi phí AI (D-60) |
| `LLM_TIMEOUT_SECONDS` | Thời gian chờ mỗi lần gọi LLM (mặc định 60) |
| `JOB_MAX_WORKERS`, `HTTP_THREAD_LIMIT` | Số job tài liệu chạy cùng lúc (mặc định 2); số request đồng bộ chạy song song (mặc định 100) |
| `AUTH_MAX_REGISTRATIONS_PER_HOUR` | Số lần tự đăng ký mỗi IP trong 1 giờ (mặc định 10) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Chỉ cho `docker compose`; bắt buộc đặt mật khẩu |
| `EVAL_*_LOGIN`, `EVAL_*_PASSWORD` | Tài khoản test/đăng nhập (xem mục 3) |

`DATABASE_URL=sqlite:///./data/app.db` (mặc định, D-20). DB tạo tự động khi chạy seed hoặc khởi động backend.

> Settings được cache (`get_settings()`): sửa `.env` thì phải **dừng hẳn** rồi chạy lại backend. `--reload` chỉ theo dõi file `.py`, không nạp lại `.env`.

Demo hiện tại **chỉ có môn SE101 Công nghệ phần mềm** (D-47/D-48). Dữ liệu thật nằm ở `data/artifacts`: PDF gốc trong `data/artifacts/pdf`, chunk trong `data/artifacts/chunks`. Một lệnh làm hết các việc sau:
- tạo môn SE101 và 3 tài khoản demo;
- đưa 15 bộ slide qua **đúng luồng** tải lên → trích xuất → thay bằng chunk artifacts → gửi duyệt → người duyệt khác duyệt → embedding → Published;
- ghi `data/manifest.cnpm.json` cho eval / `seed_users.py` / `import_books.py`.

Cờ `--confirm-demo-usage` là bắt buộc: metadata ghi quyền sử dụng là `unknown`, và việc xác nhận được ghi audit.

```bash
python scripts/seed_cnpm.py --confirm-demo-usage          # thêm --reset để gỡ bản SE101 cũ và nạp lại
```

Nếu `.env` thiếu mật khẩu, script tự sinh mật khẩu ngẫu nhiên và ghi vào `.env` (`DEMO_CNPM_*`), không in ra màn hình. Tài khoản `kiemduyet01` (`DEMO_KIEMDUYET01_*`) phải có sẵn để làm người duyệt.

Chạy backend:

```bash
uvicorn src.main:app --reload --host 127.0.0.1 --port 8000      # hoặc: make run
```

Schema DB do **Alembic** quản lý (`migrations/`): backend tự chạy `upgrade head` khi khởi động. DB cũ chưa có Alembic được tự đưa về mốc rồi nâng cấp, dữ liệu giữ nguyên. Đổi model thì thêm migration: `alembic revision --autogenerate -m "mo ta"`.

Kiểm tra: mở <http://localhost:8000/health>, kết quả phải là `{"status":"ok",...}`. Tài liệu API ở <http://localhost:8000/docs>. Mọi response đều có header `X-Request-ID`. Lỗi từ 500 trở lên hiện "mã hỗ trợ" trên giao diện; dùng mã này để tìm trong log JSON của backend (D-65).

## 3. Tài khoản

`login_id` và mật khẩu nằm trong `.env`. Các fixture `data/eval/fixtures/demo.json` và `local.json` trỏ tới các biến này.

| Tài khoản | Vai trò | Môn |
|---|---|---|
| `sinhvien` | Sinh viên | SE101 Công nghệ phần mềm |
| `giangvien` | Giảng viên | SE101 (tải tài liệu, soạn đề) |
| `quantri` | Quản trị | Không có quyền nội dung; chỉ dùng trang Quản trị |
| `kiemduyet01` | Người duyệt | SE101; dùng ngầm cho bước duyệt, không cần khi demo |

Đổi tài khoản hoặc mật khẩu trong `.env` thì chạy lại `python scripts/seed_users.py --fixtures demo`. Khi bật `DEMO_LOGIN_ENABLED`, trang đăng nhập có thêm nút đăng nhập nhanh bằng `sinhvien` / `giangvien`. Nút này không có vai trò Quản trị.

## 4. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
npm run dev                       # phát triển, có hot reload
```

Mở <http://localhost:3000>. `NEXT_PUBLIC_API_URL` trong `.env.local` mặc định là `http://localhost:8000`. Biến này được gắn vào lúc build, nên đổi giá trị thì phải chạy lại `npm run dev` / `npm run build`. Nếu đổi cổng hoặc host của frontend, thêm origin mới vào `CORS_ORIGINS` của backend.

Chạy bản build (giống môi trường demo):

```bash
npm run build
npm run start
```

Kiểm tra mã: `npm run lint` và `npx tsc --noEmit`. `package.json` không có script `typecheck`.

## 5. Docker (tùy chọn)

`docker compose up --build` dựng 3 service: `db` (Postgres 15), `backend` và `frontend`. Frontend có `frontend/Dockerfile` (Next.js standalone). Phải đặt `POSTGRES_PASSWORD` trong `.env`, nếu không compose sẽ báo lỗi. Volume Postgres đã tạo trước đây dùng mật khẩu `password`: đặt đúng giá trị đó, hoặc xóa volume để khởi tạo lại.

Lưu ý: compose đặt `DATABASE_URL` của backend sang Postgres, trong khi MVP được phát triển và kiểm thử (UAT) trên **SQLite**. Luồng Postgres chưa được kiểm chứng. Khi demo, nên chạy trực tiếp theo mục 2 và 4.

## 6. Dùng thử

| Vai trò | Menu | Thử gì |
|---|---|---|
| Sinh viên | **Hỏi đáp** | Chỉ cần gõ câu hỏi. Router tự chọn **môn** (trong các môn được cấp) và **trợ lý**:<br>• hỏi kiến thức → Academic (mỗi ý có [n]; rê chuột lên [n] để xem đoạn trích + trang, bấm để mở nguồn);<br>• "giải thích từng bước", "lập lộ trình 5 ngày mỗi ngày 45 phút" → Learning;<br>• "tìm tài liệu về…" → Knowledge Hub.<br>Chưa rõ môn thì router hỏi lại. Xin đáp án bài tập → bị từ chối (liêm chính). Hỏi ngoài kho → "chưa đủ căn cứ". |
| Sinh viên | **Tài liệu học tập** | Đọc tài liệu đã phát hành dạng trang gốc hoặc văn bản; nút **"Hỏi về tài liệu này"** chỉ lấy nguồn từ tài liệu đó (D-31, D-33) |
| Sinh viên | **Ôn tập & đề kiểm tra** | Chọn bài/chủ đề → trắc nghiệm A–D, tự luận ngắn (AI đánh giá), flashcard, điền khuyết; mỗi mục có nguồn và câu trích chứng minh đáp án (D-74). Lối tắt sang Hỏi đáp: chẩn đoán kiến thức nền, cấp cứu sát giờ thi, lập lộ trình. Làm đề do giảng viên phát hành |
| Sinh viên | **Lộ trình học** | Lập lộ trình theo số ngày hoặc ngày chọn trên lịch, mỗi buổi gắn nguồn. Buổi không tìm được nguồn được cảnh báo; phần không đủ thời gian liệt kê ở "Chưa đủ thời gian cho…" |
| Giảng viên | **Hỏi đáp** | Như sinh viên |
| Giảng viên | **Quản lý tài liệu** | Tải PDF/PPTX (khai nguồn gốc, quyền sử dụng, đối tượng đọc, nhãn), xem text từng trang, gửi duyệt; dashboard thống kê và phản hồi |
| Giảng viên | **Câu hỏi trắc nghiệm** | Soạn đề, hoặc **tải PDF để AI tạo câu**. Đề có sẵn: giữ đáp án nếu PDF có bảng đáp án. Tài liệu học: mỗi câu kèm "Căn cứ trong tài liệu" (D-74). Đề luôn ở trạng thái Nháp cho tới khi giảng viên phát hành |
| Người duyệt | **Duyệt tài liệu** | Duyệt/từ chối (bắt buộc lý do, không tự duyệt bản mình tải), thu hồi bản đang phát hành |
| Quản trị | **Quản lý tài liệu / Giám sát / Cấu hình / Hệ thống** | Khóa khẩn cấp tài liệu; giám sát vận hành và **Chi phí AI**; hạn mức câu hỏi; người dùng, môn học (gán quyền bắt buộc lý do), nhật ký hoạt động. Quản trị không có mục Hỏi đáp |

Ví dụ câu hỏi cho SE101: "Mô hình thác nước (Waterfall) có đặc điểm gì?", "Tạo 5 câu trắc nghiệm về kiểm thử phần mềm", "Giải thích tính kết dính (cohesion) bằng ví dụ về quán trà sữa", "Mai thi phần kiểm thử hộp đen, ôn cấp tốc giúp mình".

Router tự thêm thuật ngữ tiếng Anh vào câu truy xuất, và retrieval cộng điểm cho từ khóa hiếm (D-68). Câu hỏi vẫn nên nêu rõ thuật ngữ. Câu hỏi quá ngắn có thể bị cổng bằng chứng chặn: ngưỡng `retrieval_min_score` = 0,55 là đề xuất, cần hiệu chỉnh (Q-17).

**Embedding bị lỗi (429 hết quota Gemini free tier):** đợi quota đặt lại rồi bấm "Thử lại" ở trang tài liệu, hoặc chạy `python scripts/retry_index.py`. Script này chỉ embedding phần còn thiếu và có ghi audit.

## 7. Công cụ kiểm chứng

- UAT tự động mức API: `python -m eval.uat.run_uat_mvp [MÃ_CA …]`. Script chạy trên bản sao DB với backend riêng ở cổng 8100; bằng chứng ghi vào `data/uat_runs/<run_id>/`. Kịch bản và kết quả các lượt xem [docs/uat](../uat/uat_mvp.md).
- Kiểm kê nguồn, dataset, accuracy/safety/router, RAGAS, benchmark: [van_hanh.md](van_hanh.md).

## 8. Giới hạn đã biết của bản MVP

- Phiên đăng nhập lưu trong bộ nhớ backend, nên restart là phải đăng nhập lại. Job xử lý dở được chạy lại khi khởi động.
- SQLite + tìm vector bằng NumPy (đủ cho pilot vài nghìn chunk). Không OCR: PDF scan → "Cần xem lại". Router: mỗi yêu cầu đi một trợ lý.
- Chưa có cache câu trả lời. Quota tính bằng số câu hỏi/ngày (mặc định 200).
- Retention: job chạy mỗi ngày, xóa hẳn hội thoại đã xóa mềm quá 30 ngày. Audit log không bao giờ bị xóa (BL-26, D-53).
- Các ngưỡng (kích thước chunk, top-k, ngưỡng bằng chứng, giới hạn file, quota) là đề xuất trong `src/config.py`, cần chốt.

## 9. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `pip install` lỗi build `scikit-network` | Dùng Python 3.11/3.12 (mục 1) |
| Frontend báo "Chưa thể kết nối hệ thống lúc này" | Backend chưa chạy; `NEXT_PUBLIC_API_URL` trong `frontend/.env.local` sai; hoặc origin frontend chưa có trong `CORS_ORIGINS` |
| Sửa `.env` (ví dụ `AI_MODEL`) mà backend không đổi | Dừng hẳn mọi tiến trình uvicorn rồi chạy lại (mục 2) |
| Đăng nhập đúng vẫn báo sai | Chưa chạy `python scripts/seed_users.py` sau khi sửa `.env` |
| Không thấy nút Đăng nhập demo | `DEMO_LOGIN_ENABLED` chưa bật, hoặc đang ở `APP_ENV=production` |
| Tài liệu kẹt "Lỗi" với `EMBEDDING_RATE_LIMITED` | Vượt giới hạn Gemini. Bấm "Thử lại" ở trang tài liệu, hoặc giảm `EMBEDDING_BATCH_SIZE` |
| Chat báo lỗi 503 `EMBEDDING_RATE_LIMITED` / `EMBEDDING_UNAVAILABLE` / `LLM_UNAVAILABLE` | Nhà cung cấp embedding hoặc LLM lỗi/hết quota; thử lại sau. Đối chiếu mã hỗ trợ với log backend |
| `ModuleNotFoundError: psycopg` | `DATABASE_URL` trong `.env` còn giá trị mẫu Postgres → đổi thành `sqlite:///./data/app.db` |
| "Bạn đã nhập sai quá nhiều lần" | Chờ khoảng 5 phút (`AUTH_FAILED_WINDOW_SECONDS`), hoặc restart backend |
| Cổng 8000/3000 đã bị dùng | Đổi `--port`. Đổi cổng backend thì sửa `NEXT_PUBLIC_API_URL`; đổi cổng frontend thì sửa `CORS_ORIGINS` |
