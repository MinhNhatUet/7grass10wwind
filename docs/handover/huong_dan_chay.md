# Hướng dẫn chạy EDU-04 (bản MVP)

Gồm **backend** FastAPI (cổng 8000) và **frontend** Next.js (cổng 3000). Trình duyệt chỉ gọi frontend; frontend chuyển tiếp `/api/*` sang backend, nên không cần cấu hình CORS.

Bản MVP (bản tối giản): Đăng nhập, Hội thoại một ô nhập (router tự chọn môn + trợ lý) + panel nguồn, Tài liệu GV, Duyệt, Dashboard GV, Quản trị. Chi tiết phạm vi xem `docs/plans/UC-11_MVP_toan_san_pham.md`.

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
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | LLM (vilao) — judge RAGAS, agent |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `GEMINI_API_KEY` | Embedding (Gemini) |
| `EVAL_*_LOGIN`, `EVAL_*_PASSWORD` | Tài khoản test/đăng nhập (xem mục 3) |

`DATABASE_URL=sqlite:///./data/app.db` (mặc định, D-20). DB tạo tự động khi chạy seed hoặc khởi động backend.

Tạo môn + tài khoản + quyền theo môn vào DB (đọc `data/eval/fixtures/local.json` + `.env`, mật khẩu chỉ lưu dạng hash):

```bash
python scripts/seed_users.py
```

Đưa sách dev vào kho qua **đúng luồng** upload → trích xuất → gửi duyệt → người duyệt khác duyệt → index → Published. Cờ `--confirm-dev-usage` là bắt buộc, vì sách trong manifest chưa được xác nhận quyền chính thức (Q-09); việc xác nhận được ghi vào audit:

```bash
python scripts/import_books.py --course COURSE-01 --source-id TRR-07 --confirm-dev-usage
```

Text được làm sạch tự động khi trích xuất (bỏ header/footer, số trang, mục lục/chỉ mục, tàn dư hình vẽ; tách ligature; nối từ bị ngắt). Sau khi đổi quy tắc làm sạch, xử lý lại tài liệu đã phát hành bằng version mới (đủ luồng duyệt, bản cũ tự lưu trữ):

```bash
python scripts/reprocess_books.py --course COURSE-01 --reason "Làm sạch text (D-29)"
```

Mỗi cuốn khoảng 150–200 trang mất vài phút để embedding (Gemini free tier giới hạn lượng chữ mỗi phút, script tự chờ và thử lại). Hiện chỉ COURSE-01 có tài khoản người duyệt (`reviewer_course_01`). Muốn phát hành cho COURSE-02/03 cần thêm người duyệt cho môn đó (Quản trị → Quyền môn, hoặc thêm vào fixtures).

Chạy backend:

```bash
uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Kiểm tra: mở <http://localhost:8000/health>, kết quả phải là `{"status":"ok",...}`. Tài liệu API ở <http://localhost:8000/docs>.

## 3. Tài khoản

Mỗi tài khoản trong `data/eval/fixtures/local.json` lấy `login_id` và mật khẩu từ biến `EVAL_*` trong `.env`:

| Tài khoản | Vai trò | Môn |
|---|---|---|
| `student_course_01/02/03` | Sinh viên | COURSE-01 Toán rời rạc / COURSE-02 CTDL&GT / COURSE-03 PT&TK thuật toán |
| `lecturer_course_01/02/03` | Giảng viên | như trên |
| `reviewer_course_01` | Giảng viên duyệt | COURSE-01 |
| `admin` | Quản trị | không có quyền nội dung; dùng trang Quản trị |

Đổi tài khoản hoặc mật khẩu trong `.env` thì phải chạy lại `python scripts/seed_users.py`.

## 4. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
npm run dev                       # phát triển, có hot reload
```

Mở <http://localhost:3000>. `NEXT_PUBLIC_API_URL` trong `.env.local` mặc định là `http://localhost:8000` (frontend gọi thẳng `${NEXT_PUBLIC_API_URL}/api/v1`, gắn lúc build — đổi thì chạy lại `npm run dev`/`build`).

Chạy bản build (giống môi trường demo):

```bash
npm run build
npm run start
```

Kiểm tra kiểu: `npm run typecheck`.

## 5. Dùng thử

| Vai trò | Thử gì |
|---|---|
| Sinh viên | Đăng nhập xong vào thẳng **Hội thoại**. Chỉ cần gõ câu hỏi: router tự chọn **môn** (trong các môn bạn được cấp) và **trợ lý** — hỏi kiến thức → Academic (trích dẫn [n], bấm để mở nguồn ở panel phải); "giải thích từng bước", "cho tôi câu hỏi tự kiểm tra", "lập lộ trình 5 ngày mỗi ngày 45 phút" → Learning; "tìm tài liệu về…" → Knowledge Hub. Mỗi câu trả lời hiện "Router: <trợ lý> · <môn>". Chưa rõ môn thì router hỏi lại. Hỏi xin đáp án bài tập → bị từ chối (liêm chính). Hỏi ngoài kho → "chưa đủ căn cứ". Báo lỗi hoặc chia sẻ với GV ngay dưới câu trả lời. |
| Giảng viên | Menu **Tài liệu**: tải PDF/PPTX (khai đủ nguồn gốc, quyền sử dụng, đối tượng đọc, nhãn), xem text từng trang, gửi duyệt. |
| GV duyệt | Menu **Duyệt**: duyệt/từ chối (bắt buộc lý do, không tự duyệt bản mình tải), thu hồi bản đang phát hành. **Dashboard**: thống kê, phản hồi, lịch sử. |
| Quản trị | **Quản trị**: cấp/khóa tài khoản, gán môn và quyền (bắt buộc lý do), khóa khẩn cấp tài liệu, xem audit. |

**Công cụ học chủ động (D-30)** — dùng nút gợi ý dưới ô nhập hoặc gõ thẳng:

| Nút / câu mẫu | Kết quả |
|---|---|
| "Tôi không biết bắt đầu từ đâu" | 3 câu tình huống chẩn đoán; nộp bài → mức hiểu từng chủ đề + link "đọc trang … trước rồi quay lại" |
| "Tạo flashcard về cây khung" | bộ thẻ lật (tự nhớ → lật → "Đã nhớ"), mỗi thẻ có nguồn |
| "Tạo bài điền khuyết về đường đi Euler" | câu có chỗ trống, bấm "Kiểm tra" để chấm |
| "Giải thích định lý Ore bằng ví dụ về shipper giao trà sữa" | giải thích có nguồn + đoạn ẩn dụ đời thường được đánh dấu rõ không phải nội dung nguồn |
| "Mai thi phần đồ thị Euler, ôn cấp tốc giúp mình" | 3 phần: định nghĩa phải thuộc, sai lầm cần tránh (chỉ khi tài liệu có), 2 ví dụ cốt lõi |

Router tự thêm thuật ngữ tiếng Anh vào câu truy xuất, nhưng câu hỏi vẫn nên nêu rõ thuật ngữ, ví dụ "Cây khung (spanning tree) là gì". Sách dev là tiếng Anh, nên câu hỏi tiếng Việt quá ngắn có thể bị cổng bằng chứng chặn (ngưỡng `retrieval_min_score` = 0,55 là đề xuất, cần hiệu chỉnh trên tập dev — Q-17).

**Thư viện (menu "Thư viện"):** danh sách tài liệu đã phát hành của môn đang chọn, đọc dạng **Trang gốc** (ảnh PDF render phía server) hoặc **Văn bản**, chuyển trang bằng thanh ‹ N › hoặc phím ← →. Nút **"Hỏi về tài liệu này"** mở hội thoại chỉ lấy nguồn từ tài liệu đó (D-31, D-33).

**Nhập sách bị lỗi embedding (429 hết quota Gemini free tier):** đợi quota đặt lại rồi chạy `python scripts/retry_index.py` — chỉ embedding phần còn thiếu, có audit.

## 6. Công cụ kiểm chứng (TV1)

Xem [van_hanh.md](van_hanh.md): kiểm kê nguồn, kiểm tra dataset, runner accuracy/safety/router, RAGAS, benchmark.

## 7. Giới hạn đã biết của bản MVP

- Phiên đăng nhập lưu trong bộ nhớ backend: restart là phải đăng nhập lại. Job xử lý dở được chạy lại khi khởi động.
- SQLite + tìm vector bằng numpy (đủ cho pilot vài nghìn chunk). Không OCR (PDF scan → "Cần xem lại"). Router: một yêu cầu đi một trợ lý (chưa chia yêu cầu nhiều ý thành nhiều bước).
- Chưa có cache câu trả lời, chưa có retention tự động (xóa hội thoại là xóa mềm), quota = số câu hỏi/ngày.
- Chưa Docker hóa frontend (BL-29).
- Các ngưỡng (kích thước chunk, top-k, ngưỡng bằng chứng, giới hạn file, quota) là đề xuất trong `src/config.py`, cần chốt.

## 8. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `pip install` lỗi build `scikit-network` | Dùng Python 3.11/3.12 (mục 1) |
| Frontend báo "Chưa thể kết nối hệ thống lúc này" | Backend chưa chạy, hoặc `NEXT_PUBLIC_API_URL` trong `frontend/.env.local` sai |
| Đăng nhập đúng vẫn báo sai | Chưa chạy `python scripts/seed_users.py` sau khi sửa `.env` |
| Tài liệu kẹt "Lỗi" với `EMBEDDING_RateLimitError` | Vượt giới hạn Gemini; bấm "Thử lại" ở trang Tài liệu (hoặc giảm `EMBEDDING_BATCH_SIZE`) |
| `ModuleNotFoundError: psycopg` | `DATABASE_URL` trong `.env` còn là giá trị mẫu Postgres → đổi thành `sqlite:///./data/app.db` |
| "Bạn đã nhập sai quá nhiều lần" | Chờ khoảng 5 phút, hoặc restart backend |
| Cổng 8000/3000 đã bị dùng | Đổi `--port`; nếu đổi cổng backend thì sửa `NEXT_PUBLIC_API_URL` tương ứng rồi chạy lại frontend |
