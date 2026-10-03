# Báo cáo Review Toàn bộ Source Code — EDU-04 (P-134)

---

## 1. Tổng quan

```text
Dự án:          EDU-04 — Kho tri thức hỗ trợ học thuật
Công nghệ:      Backend: Python 3.11 / FastAPI / SQLAlchemy / SQLite (MVP) / LangChain + LangGraph
                Frontend: Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / shadcn
                AI: LLM tương thích OpenAI + Embedding Gemini/OpenAI
                Triển khai: Docker / docker-compose (Postgres cho production, SQLite cho dev)
Kiến trúc:      Backend đơn khối (monolith) với phân lớp dịch vụ + LangGraph điều phối
                Frontend Next.js giao tiếp qua REST API
Sức khoẻ code:  MVP chắc chắn, logic nghiệp vụ trưởng thành, thiết kế ACL/audit tốt,
                vòng đời tài liệu hoàn chỉnh. Một số vấn đề bảo mật và kiến trúc cần
                xử lý trước khi triển khai production.
Nghiêm trọng:   2
Cao:            6
Trung bình:     12
Thấp:           8
```

---

## 2. Tổng quan Kiến trúc

```text
Người dùng (Trình duyệt)
 ↓
Frontend Next.js (cổng 3000)
 ↓ Gọi REST API (xác thực Bearer token)
Backend FastAPI (cổng 8000)
 ├─ Tầng API (src/api/) — định tuyến, validate, định dạng response
 ├─ Tầng Dịch vụ (src/services/) — logic nghiệp vụ, ACL, xác thực, vòng đời tài liệu
 ├─ Tầng Agent (src/agents/) — LangGraph điều phối (policy → router → trợ lý)
 ├─ Knowledge Hub (src/knowledge_hub/) — module tìm kiếm/truy xuất độc lập
 ├─ Ingestion (src/ingestion/) — phân tích PDF/PPTX, chia chunk, làm sạch text
 ├─ Models (src/models/) — SQLAlchemy ORM + Pydantic schemas
 └─ Cơ sở dữ liệu (SQLite dev / PostgreSQL prod)
     └─ Lưu trữ embedding (LargeBinary trong bảng chunks, tính cosine trong process)
```

**Các quyết định kiến trúc chính:**
- Phiên đăng nhập lưu trong bộ nhớ (không bền vững — mất khi khởi động lại)
- Job nền chạy bằng daemon thread (không dùng hàng đợi tác vụ)
- Vector embedding lưu dạng binary blob trong SQLite/Postgres (không dùng vector DB chuyên dụng cho RAG)
- Module Knowledge Hub thiết kế độc lập, không phụ thuộc framework, có adapter cho DB
- Điều phối đa trợ lý qua LangGraph (academic, learning, hub, kèm policy/routing)

---

## 3. Lỗi Nghiêm trọng (CRITICAL)

| ID | Mức độ | File | Vị trí | Vấn đề | Tác động | Khuyến nghị |
|---|---|---|---|---|---|---|
| C-01 | 🔴 NGHIÊM TRỌNG | [.env](file:///d:/AI20K/BuildPhase/P-134/.env) | L20, L25 | **API key thật bị lưu trong `.env`**: `GEMINI_API_KEY` và `GOOGLE_API_KEY` chứa giá trị credential thật (`[ĐÃ CHE]`). Dù `.env` nằm trong `.gitignore`, file này tồn tại trong thư mục làm việc và có thể đã từng được commit. | Lộ credential. Kẻ tấn công có quyền truy cập repo có thể dùng key gọi Google/Gemini API trên tài khoản dự án, hoặc mở rộng tấn công. | Xoay key ngay lập tức. Kiểm tra lịch sử git bằng `git log --all -- .env` để đảm bảo file chưa bao giờ bị commit. Nếu đã commit, coi key đã bị lộ hoàn toàn. |
| C-02 | 🔴 NGHIÊM TRỌNG | [.env](file:///d:/AI20K/BuildPhase/P-134/.env) | L54 | **API key ghi log bị lưu cứng**: `AI_LOG_API_KEY=[ĐÃ CHE]` — key thật cho dịch vụ ghi log bị lưu trực tiếp. | Lộ credential tới hạ tầng ghi log của instructor. | Xoay key. Chuyển sang quản lý bí mật (secrets manager) hoặc đảm bảo `.env` không bao giờ bị tracked. |

---

## 4. Lỗi Ưu tiên Cao (HIGH)

| ID | Mức độ | File | Vị trí | Vấn đề | Tác động | Khuyến nghị |
|---|---|---|---|---|---|---|
| H-01 | 🟠 CAO | [docker-compose.yml](file:///d:/AI20K/BuildPhase/P-134/docker-compose.yml) | L8-L9 | **Thông tin đăng nhập DB lưu cứng**: `POSTGRES_USER: user`, `POSTGRES_PASSWORD: password`. Credential mặc định/yếu dùng trực tiếp trong compose. | Bất kỳ ai có quyền truy cập file compose hoặc mạng Docker đều có thể truy cập/thao túng CSDL. Rủi ro xâm phạm production. | Dùng biến môi trường (`${POSTGRES_PASSWORD}`) và file `.env` không nằm trong VCS, hoặc dùng Docker secrets. |
| H-02 | 🟠 CAO | [src/services/auth.py](file:///d:/AI20K/BuildPhase/P-134/src/services/auth.py) | L67-L99 | **Kho phiên lưu trong bộ nhớ**: Mọi phiên đăng nhập được lưu trong `dict` Python được bảo vệ bởi `threading.Lock`. Phiên bị mất khi khởi động lại, và kho tăng không giới hạn (phiên hết hạn chỉ được dọn khi truy cập, không chủ động). | 1. Mọi lần khởi động lại sẽ đăng xuất toàn bộ người dùng. 2. Rò rỉ bộ nhớ: phiên của người dùng đóng trình duyệt mà không đăng xuất tích luỹ mãi. 3. Không tương thích với triển khai multi-worker (mỗi worker có kho riêng). | Thêm dọn dẹp định kỳ phiên hết hạn. Cho production: chuyển sang phiên Redis/DB hoặc dùng JWT token với thời hạn ngắn. |
| H-03 | 🟠 CAO | [src/services/documents.py](file:///d:/AI20K/BuildPhase/P-134/src/services/documents.py) | L540-L543 | **Job nền dùng thread trần không giới hạn đồng thời**: `start_job()` tạo một daemon thread mới cho mỗi job. Không có thread pool, không có semaphore, không có hàng đợi. | Khi tải nặng (nhiều upload), hàng trăm thread có thể được tạo đồng thời, mỗi thread thực hiện parse PDF tốn CPU + gọi API embedding, gây cạn kiệt tài nguyên và OOM. | Dùng `concurrent.futures.ThreadPoolExecutor` với pool size giới hạn, hoặc chuyển sang hàng đợi tác vụ (Celery, ARQ, v.v.). |
| H-04 | 🟠 CAO | [src/main.py](file:///d:/AI20K/BuildPhase/P-134/src/main.py) | L46-L53 | **CORS dùng wildcard cho methods và headers**: `allow_methods=["*"]`, `allow_headers=["*"]`. Kết hợp với hỗ trợ credential (`allow_credentials=True`), cấu hình này quá mở. | Mở rộng bề mặt tấn công cho các tấn công liên quan CSRF. Dù `allow_origins` được cấu hình, wildcard methods/headers vẫn làm giảm mức bảo mật. | Giới hạn đúng các methods thực tế sử dụng (`GET, POST, PUT, PATCH, DELETE, OPTIONS`) và headers cụ thể (`Authorization, Content-Type, Idempotency-Key`). |
| H-05 | 🟠 CAO | [src/services/retrieval.py](file:///d:/AI20K/BuildPhase/P-134/src/services/retrieval.py) | L25-L27 | **Cache embedding tăng không giới hạn**: `_cache` là dict cấp module lưu cache embedding version mãi mãi. Không eviction, không TTL, không giới hạn kích thước. | Trong process chạy lâu với nhiều version đã phát hành, bộ nhớ bị tiêu thụ đáng kể. Ma trận embedding cho bộ sưu tập lớn (100+ version × 1000+ chunk × 768 chiều × 4 byte) có thể đạt hàng GB. | Dùng `functools.lru_cache` với `maxsize`, hoặc cài đặt LRU eviction. Đồng thời xoá cache khi version bị thu hồi/lưu trữ. |
| H-06 | 🟠 CAO | [src/api/auth.py](file:///d:/AI20K/BuildPhase/P-134/src/api/auth.py) | L82-L106 | **Đăng ký tự do không cần phê duyệt admin**: Bất kỳ ai cũng có thể đăng ký và ngay lập tức có tài khoản `student`. Không xác minh email, không CAPTCHA, không quy trình phê duyệt admin. | Cho phép tạo tài khoản không giới hạn (vector DoS, tài khoản spam). `student` không có membership thì quyền hạn chế, nhưng bảng user tăng không giới hạn. | Thêm rate limiting trên endpoint đăng ký. Cân nhắc xác minh email hoặc phê duyệt admin. Ít nhất thêm CAPTCHA hoặc token đăng ký. |

---

## 5. Lỗi Ưu tiên Trung bình (MEDIUM)

| ID | File | Vị trí | Vấn đề | Khuyến nghị |
|---|---|---|---|---|
| M-01 | [src/services/auth.py](file:///d:/AI20K/BuildPhase/P-134/src/services/auth.py) | L101-L125 | **Rate limiter đăng nhập lưu trong bộ nhớ**: `LoginRateLimiter._failures` là `defaultdict(deque)` trong RAM. Triển khai multi-worker có limiter độc lập; kẻ tấn công có thể bypass bằng cách nhắm vào worker khác. Ngoài ra, entry cho user không tồn tại tích luỹ (rò rỉ bộ nhớ nếu kẻ tấn công brute-force random login_id). | Chuyển sang rate limiting dựa Redis, hoặc ít nhất thêm giới hạn số key tối đa. |
| M-02 | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | L311-L415 | **Hàm `send()` dài 105 dòng**: Hàm này xử lý kiểm tra quota, lưu tin nhắn, gọi orchestrator, lưu câu trả lời, gắn lộ trình, ghi usage, và xử lý lỗi — tất cả trong một phương thức. | Tách thành các hàm con (ví dụ `_invoke_orchestrator`, `_persist_and_serialize`). Hàm hoạt động đúng nhưng khả năng bảo trì bị ảnh hưởng. |
| M-03 | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | L248 | **`_history()` tải TẤT CẢ tin nhắn**: `_history()` lấy mọi tin nhắn trong hội thoại để xây context cho LLM. Với hội thoại dài, điều này vừa chậm (nhiều truy vấn DB + serialization) vừa có thể vượt cửa sổ context LLM. | Thêm tham số `limit` (ví dụ 20 tin nhắn gần nhất). Orchestrator/LLM nên quản lý cửa sổ context, nhưng service không nên tải dữ liệu không giới hạn. |
| M-04 | [src/api/admin.py](file:///d:/AI20K/BuildPhase/P-134/src/api/admin.py) | L234 | **`list_users` tải TOÀN BỘ user từ DB**: `db.scalars(select(User))` trong `audit_log` và `costs` truy vấn tất cả user để xây bảng tra tên. | Thêm phân trang cho danh sách user. Cho bảng tra tên, dùng truy vấn có điều kiện: `select(User.id, User.display_name).where(User.id.in_(actor_ids))`. |
| M-05 | [src/services/knowledge_hub_database.py](file:///d:/AI20K/BuildPhase/P-134/src/services/knowledge_hub_database.py) | L157-L188 | **`SQLAlchemyVectorStore.search` tính cosine similarity bằng Python thuần**: Vòng lặp tính tích vô hướng từng phần tử cho mỗi chunk. | Rất chậm so với phép toán numpy đã dùng trong `src/services/retrieval.py`. Dùng numpy cho tìm kiếm vector Knowledge Hub, hoặc tái sử dụng hạ tầng cache `_matrix` hiện có. |
| M-06 | [src/services/retention.py](file:///d:/AI20K/BuildPhase/P-134/src/services/retention.py) | L17-L54 | **Worker dọn dữ liệu dùng `time.sleep(86400)` trong thread**: Nếu thao tác DB tốn thời gian hoặc lỗi, bộ đếm 24h khởi động lại sau thao tác, gây trôi thời gian. Không có cơ chế tắt graceful. | Dùng `threading.Event.wait(timeout=86400)` để cho phép ngắt. Cân nhắc hook `atexit` hoặc xử lý signal. |
| M-07 | [frontend/src/lib/session.ts](file:///d:/AI20K/BuildPhase/P-134/frontend/src/lib/session.ts) | L2-L8 | **Token lưu trong `localStorage`**: Access token trong `localStorage` có thể bị truy cập bởi bất kỳ JavaScript nào chạy trên cùng origin. | Cân nhắc dùng cookie `httpOnly` cho lưu trữ token (cần thay đổi backend). Nếu phải dùng `localStorage`, đảm bảo header CSP nghiêm ngặt để giảm thiểu XSS. |
| M-08 | [src/models/orm.py](file:///d:/AI20K/BuildPhase/P-134/src/models/orm.py) | L251 | **`StudyPlan.course_id` thiếu ràng buộc khoá ngoại**: `course_id` khai báo là `String(40)` không có `ForeignKey("courses.id")`, khác với các model khác. | Thêm ràng buộc FK. Đây có thể là thiếu sót vì `Membership`, `Document`, v.v. đều tham chiếu `courses.id`. Rủi ro dữ liệu mồ côi. |
| M-09 | [src/db.py](file:///d:/AI20K/BuildPhase/P-134/src/db.py) | L54-L65 | **Migration thủ công bằng ALTER TABLE mệnh lệnh**: Sáu hàm `_migrate_*` chạy mỗi lần khởi động, mỗi hàm kiểm tra cột và chạy `ALTER TABLE`. | Hoạt động được nhưng không mở rộng được. Cân nhắc áp dụng Alembic (đã có trong `requirements.txt` dạng comment) để quản lý migration đúng cách. Cách hiện tại không theo dõi phiên bản migration và sẽ thất bại khi đổi tên/xoá cột. |
| M-10 | [src/services/documents.py](file:///d:/AI20K/BuildPhase/P-134/src/services/documents.py) | L498-L537 | **Xử lý lỗi job bắt tất cả exception bằng `except` trần**: Dù có chủ đích (job không được làm crash process), catch rộng với `rollback` + `db.commit` trong finally có thể che giấu lỗi lập trình. | Thêm phân loại lỗi có cấu trúc. Log toàn bộ exception. Cân nhắc xử lý riêng `OperationalError` (lỗi DB) vs. `ValueError` (lỗi dữ liệu) vs. lỗi không mong đợi. |
| M-11 | [requirements.txt](file:///d:/AI20K/BuildPhase/P-134/requirements.txt) | L36 | **`langchain-community` ghim ở `<0.4`**: Comment ghi `ragas 0.4.3` yêu cầu. Điều này ghim một dependency lớn ở phiên bản có thể lỗi thời. | Theo dõi khi `ragas` hỗ trợ `langchain-community` mới hơn. Ràng buộc này có thể chặn bản vá bảo mật trong langchain. |
| M-12 | [src/api/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/api/conversations.py) | L139-L156 | **Endpoint chat `send` là đồng bộ (synchronous)**: Hàm `send` gọi LLM đồng bộ (chặn worker thread). FastAPI chạy endpoint sync trong threadpool, nhưng LLM có thể mất 10-60 giây. | Với thread pool mặc định của Uvicorn ~40, 40 request chat đồng thời sẽ chặn tất cả worker. Cân nhắc làm endpoint async với `await run_in_executor()`, hoặc triển khai phản hồi streaming SSE. |

---

## 6. Lỗi Nhỏ / Code Smell

| ID | File | Vị trí | Vấn đề | Khuyến nghị |
|---|---|---|---|---|
| L-01 | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | L31, L210 | **Helper `_iso` định nghĩa ở nhiều nơi**: Hàm format datetime `_iso()` tồn tại trong `conversations.py`, `dashboard.py`, `documents.py`, và `knowledge_hub_database.py` với biến thể nhỏ. | Trích xuất vào module tiện ích chung (ví dụ `src/services/formatting.py`). |
| L-02 | [src/api/quizzes.py](file:///d:/AI20K/BuildPhase/P-134/src/api/quizzes.py) | L140 | **Truy cập hàm private xuyên module**: `svc._iso(p.updated_at)` truy cập hàm private từ service `course_quiz`. | Đưa ra hàm `iso()` public hoặc dùng tiện ích chung. |
| L-03 | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | L214-L218 | **Import muộn trong hàm**: `from src.models.orm import Document, DocumentVersion` trong `_can_download()` — các class này đã được import ở cấp module. | Xoá import thừa. |
| L-04 | [src/config.py](file:///d:/AI20K/BuildPhase/P-134/src/config.py) | L19 | **`app_host` mặc định là `0.0.0.0`**: Dù phổ biến cho container, điều này bind tới mọi interface kể cả public khi chạy local. | Mặc định `127.0.0.1` cho development; ghi đè trong Docker/production. |
| L-05 | [src/models/orm.py](file:///d:/AI20K/BuildPhase/P-134/src/models/orm.py) | L24-L28 | **Hằng số trạng thái dùng tuple, không phải enum**: Trạng thái tài liệu, vai trò, nhãn liêm chính là tuple thuần. Không có type safety. | Cân nhắc dùng `StrEnum` (Python 3.11+) để IDE hỗ trợ tốt hơn và có validate. Không chặn nhưng cải thiện khả năng bảo trì. |
| L-06 | [frontend/package.json](file:///d:/AI20K/BuildPhase/P-134/frontend/package.json) | L17 | **Package `cn`**: Package npm `cn` (v0.4.0) cung cấp tiện ích classname tối thiểu. Trùng chức năng với `clsx` + `tailwind-merge` (hoặc `class-variance-authority` đã cài). | Kiểm tra `cn` có thực sự được dùng không. Nếu chỉ cần hành vi kiểu `clsx`, xoá và dùng `cva` hoặc viết hàm một dòng. |
| L-07 | [src/api/documents.py](file:///d:/AI20K/BuildPhase/P-134/src/api/documents.py) | L26-L27 | **`_iso` trả `str | None` nhưng một số nơi gọi không xử lý `None`**: Helper âm thầm trả `None` cho datetime thiếu. Frontend có thể nhận `null` ở những chỗ không mong đợi. | Ghi chú hợp đồng. Cân nhắc trả chuỗi rỗng hoặc ISO epoch cho nhất quán. |
| L-08 | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | L364 | **Chuỗi magic `"Hội thoại mới"`**: Tiêu đề hội thoại mặc định được kiểm tra bằng so sánh chuỗi trực tiếp. | Trích xuất thành hằng số (ví dụ `DEFAULT_TITLE = "Hội thoại mới"`) và tham chiếu ở cả ORM default lẫn chỗ kiểm tra. |

---

## 7. Phát hiện Bảo mật

| ID | Mức độ | File | Vấn đề | Rủi ro | Khuyến nghị |
|---|---|---|---|---|---|
| S-01 | 🔴 NGHIÊM TRỌNG | [.env](file:///d:/AI20K/BuildPhase/P-134/.env) | Credential API có thể bị lộ (GEMINI_API_KEY, GOOGLE_API_KEY, AI_LOG_API_KEY) | Đánh cắp credential, sử dụng API trái phép | Xoay key ngay. Kiểm tra lịch sử git. |
| S-02 | 🟠 CAO | [docker-compose.yml](file:///d:/AI20K/BuildPhase/P-134/docker-compose.yml) | Thông tin đăng nhập DB lưu cứng dạng plaintext | Truy cập CSDL trái phép | Dùng biến môi trường hoặc Docker secrets. |
| S-03 | 🟠 CAO | [src/main.py](file:///d:/AI20K/BuildPhase/P-134/src/main.py) | CORS quá mở (wildcard methods/headers + credentials) | Mở rộng bề mặt tấn công CSRF/XSS | Liệt kê cụ thể methods và headers được phép. |
| S-04 | 🟡 TRUNG BÌNH | [frontend/src/lib/session.ts](file:///d:/AI20K/BuildPhase/P-134/frontend/src/lib/session.ts) | Token trong localStorage (XSS có thể truy cập) | Đánh cắp token qua XSS | Dùng cookie httpOnly hoặc thêm CSP nghiêm ngặt. |
| S-05 | 🟡 TRUNG BÌNH | [src/api/auth.py](file:///d:/AI20K/BuildPhase/P-134/src/api/auth.py) | Đăng ký không có CAPTCHA/xác minh email | Liệt kê tài khoản, tài khoản spam | Thêm rate limiting và CAPTCHA. |
| S-06 | 🔵 THẤP | [src/observability.py](file:///d:/AI20K/BuildPhase/P-134/src/observability.py) | Tốt: Lọc log, che bí mật, truy vết request ID | Phát hiện tích cực | Tiếp tục. Triển khai tốt. |
| S-07 | 🔵 THẤP | [src/services/auth.py](file:///d:/AI20K/BuildPhase/P-134/src/services/auth.py) | Tốt: So sánh mật khẩu hằng thời gian (`hmac.compare_digest`), hash giả chống timing attack | Phát hiện tích cực | Tiếp tục. Triển khai tốt. |

---

## 8. Phát hiện Hiệu năng

| ID | Mức độ | File | Vấn đề | Tại sao | Khuyến nghị |
|---|---|---|---|---|---|
| P-01 | 🟠 CAO | [knowledge_hub_database.py](file:///d:/AI20K/BuildPhase/P-134/src/services/knowledge_hub_database.py) | Cosine similarity bằng Python thuần | `O(n × d)` mỗi chunk trong Python vs. numpy vectorized `O(n)` cho phép nhân ma trận. Với 10K chunk × 768 chiều, chậm hơn ~100 lần. | Dùng numpy vectorized như `src/services/retrieval.py` đã làm. |
| P-02 | 🟠 CAO | [src/services/retrieval.py](file:///d:/AI20K/BuildPhase/P-134/src/services/retrieval.py) | Cache embedding không bao giờ bị xoá | Bộ nhớ tăng tuyến tính theo số version phát hành. Không invalidation khi version bị thu hồi. | Thêm LRU eviction và invalidation khi trạng thái version thay đổi. |
| P-03 | 🟡 TRUNG BÌNH | [src/services/conversations.py](file:///d:/AI20K/BuildPhase/P-134/src/services/conversations.py) | `_history()` tải tất cả tin nhắn không giới hạn | Hội thoại 100+ tin nhắn → 100+ truy vấn DB + serialization mỗi tin nhắn mới. | Giới hạn N tin nhắn gần nhất (ví dụ 20). |
| P-04 | 🟡 TRUNG BÌNH | [src/api/admin.py](file:///d:/AI20K/BuildPhase/P-134/src/api/admin.py) | `costs()` tải tất cả sự kiện sử dụng vào Python | Với hệ thống lưu lượng cao, `select(UsageEvent)` với bộ lọc ngày có thể trả hàng triệu dòng, tất cả nạp vào RAM. | Dùng SQL aggregation (`GROUP BY date, assistant, course_id, user_id`) để đẩy tính toán xuống CSDL. |
| P-05 | 🔵 THẤP | [src/api/admin.py](file:///d:/AI20K/BuildPhase/P-134/src/api/admin.py) | `audit_log` và `costs` truy vấn tất cả user để tra tên | `select(User)` trả về tất cả user dù chỉ một phần được tham chiếu. | Chỉ truy vấn các user ID được tham chiếu. |

---

## 9. Thiếu sót về Test

Bộ test bao phủ một số flow quan trọng nhưng có lỗ hổng đáng kể:

| Flow | Trạng thái Test | Ưu tiên |
|---|---|---|
| Đăng nhập/đăng xuất/đăng ký | ❌ Chưa có | Cao — flow bảo mật cốt lõi |
| Tải lên tài liệu + trích xuất | ❌ Chưa có | Cao — flow nghiệp vụ cốt lõi |
| Gửi chat (với LLM mock) | ❌ Chưa có | Cao — hành trình người dùng cốt lõi |
| Kiểm soát ACL (BR-01/02/03/06) | ❌ Không rõ (có test trong `test_plan_access.py` cho lộ trình, nhưng không cho tài liệu/chat) | Nghiêm trọng |
| Thu hồi tài liệu + che trích dẫn | ✅ `test_index_withdrawal.py` | — |
| Kiểm soát truy cập lộ trình học | ✅ `test_plan_access.py` | — |
| Luồng tài liệu (gửi/duyệt/phát hành) | ✅ `test_document_workflows.py` | — |
| Giới hạn tần suất embedding | ✅ `test_embedding_rate_limit.py` | — |
| API Admin (CRUD user, CRUD môn, khoá) | ❌ Chưa có | Trung bình |
| Tìm kiếm Knowledge Hub | ✅ `tests/knowledge_hub/` | — |
| E2E Frontend | ❌ Chưa có | Trung bình |
| CORS/header bảo mật | ❌ Chưa có | Trung bình |

**Test thiếu nghiêm trọng:** Flow đăng nhập, flow chat, và flow tải tài liệu không có test tự động. Đây là các tính năng người dùng tiếp xúc nhiều nhất.

---

## 10. Nợ Kỹ thuật

### Phải sửa (Must Fix)
- **C-01/C-02**: Xoay API key bị lộ ngay lập tức
- **H-01**: Xoá thông tin đăng nhập DB lưu cứng khỏi docker-compose
- **H-02**: Thêm dọn dẹp phiên để chống rò rỉ bộ nhớ

### Nên sửa (Should Fix)
- **H-03**: Giới hạn thread pool cho job nền
- **H-05**: Thêm eviction cache cho ma trận embedding
- **M-09**: Chuyển từ ALTER TABLE thủ công sang Alembic
- **M-12**: Xử lý endpoint chat sync gây chặn
- **M-08**: Thêm ràng buộc FK cho `StudyPlan.course_id`
- Thêm test cho flow đăng nhập, chat, và tải tài liệu

### Có thể cải thiện (Could Improve)
- **M-02**: Refactor `send()` thành các hàm nhỏ hơn
- **M-05**: Dùng numpy trong tìm kiếm vector Knowledge Hub
- **L-01**: Gộp các helper `_iso`
- **L-05**: Dùng StrEnum cho hằng số trạng thái
- Áp dụng Alembic cho migration
- Thêm response model OpenAPI cho tất cả endpoint

---

## 11. Thứ tự Refactoring Khuyến nghị

1. **Bảo mật** — Xoay key (C-01, C-02), sửa credential Docker (H-01), hạn chế CORS (H-04)
2. **Tính đúng đắn** — Thêm FK cho StudyPlan (M-08), sửa import muộn (L-03)
3. **Độ tin cậy** — Giới hạn thread pool cho job (H-03), dọn phiên (H-02), eviction cache (H-05)
4. **Hiệu năng** — Numpy trong Knowledge Hub (M-05), SQL aggregation trong costs (P-04), giới hạn history (M-03)
5. **Kiến trúc** — Alembic migration (M-09), trích xuất tiện ích chung (L-01), async chat endpoint (M-12)
6. **Khả năng bảo trì** — Refactor `send()` (M-02), gộp helper _iso (L-01), StrEnum cho hằng số (L-05)
7. **Phong cách** — Trích xuất chuỗi magic (L-08), dọn dependency package (L-06)

---

## 12. Đánh giá Tài liệu

| Tài liệu | Trạng thái | Ghi chú |
|---|---|---|
| [README.md](file:///d:/AI20K/BuildPhase/P-134/README.md) | ✅ Có | Mô tả tổng quan dự án toàn diện |
| [ARCHITECTURE.md](file:///d:/AI20K/BuildPhase/P-134/ARCHITECTURE.md) | ✅ Có | Mô tả kiến trúc cấp cao |
| [.env.example](file:///d:/AI20K/BuildPhase/P-134/.env.example) | ✅ Có | Template tốt với mô tả đầy đủ |
| Tài liệu API | ⚠️ Một phần | FastAPI tự tạo OpenAPI docs, nhưng thiếu response model cho hầu hết endpoint (trả `dict[str, Any]` thô). |
| Hướng dẫn triển khai | ⚠️ Một phần | Có setup Docker nhưng không có hướng dẫn triển khai production |
| Comment code | ✅ Tốt | Comment inline tiếng Việt + Anh tham chiếu yêu cầu PRD (truy vết tốt) |

---

## Các Bước Tiếp theo Khuyến nghị

### Giai đoạn 1 — Ngay lập tức (Bảo mật)

```text
[ ] TASK-S01 — Xoay tất cả API key bị lộ (GEMINI_API_KEY, GOOGLE_API_KEY, AI_LOG_API_KEY)
    File: .env
    Lý do: Key có mặt trong thư mục làm việc và có thể trong lịch sử git
    Kết quả mong đợi: Key mới được cấp, key cũ bị thu hồi, xác nhận .env không trong lịch sử git

[ ] TASK-S02 — Xoá thông tin đăng nhập DB lưu cứng khỏi docker-compose.yml
    File: docker-compose.yml
    Lý do: Credential plaintext trong config được quản lý phiên bản
    Kết quả mong đợi: Credential lấy từ .env hoặc Docker secrets

[ ] TASK-S03 — Hạn chế CORS methods và headers
    File: src/main.py
    Lý do: Wildcard methods/headers với credentials quá mở
    Kết quả mong đợi: Whitelist cụ thể các methods và headers thực sự dùng
```

### Giai đoạn 2 — Ổn định (Độ tin cậy + Test)

```text
[ ] TASK-R01 — Thêm giới hạn thread pool cho job nền
    File: src/services/documents.py
    Lý do: Tạo thread không giới hạn khi tải nặng
    Kết quả mong đợi: ThreadPoolExecutor với max_workers cấu hình được

[ ] TASK-R02 — Thêm dọn dẹp kho phiên (GC định kỳ hoặc khi truy cập)
    File: src/services/auth.py
    Lý do: Phiên hết hạn tích luỹ mãi trong bộ nhớ
    Kết quả mong đợi: Thread dọn dẹp định kỳ hoặc eviction dựa TTL

[ ] TASK-R03 — Thêm eviction + invalidation cache embedding
    File: src/services/retrieval.py
    Lý do: Cache tăng không giới hạn; entry lỗi thời sau thu hồi
    Kết quả mong đợi: LRU cache với maxsize; invalidation khi trạng thái version thay đổi

[ ] TASK-T01 — Thêm test API xác thực (đăng nhập, đăng ký, demo-login, đăng xuất)
    File: tests/test_api/
    Lý do: Flow bảo mật cốt lõi chưa có test
    Kết quả mong đợi: Test bao phủ happy path + trường hợp lỗi (sai mật khẩu, bị khoá, rate limit)

[ ] TASK-T02 — Thêm test gửi chat với LLM mock
    File: tests/test_api/
    Lý do: Hành trình người dùng cốt lõi chưa được test
    Kết quả mong đợi: Test bao phủ gửi, idempotency, quota, xử lý lỗi
```

### Giai đoạn 3 — Tái cấu trúc (Kiến trúc)

```text
[ ] TASK-A01 — Áp dụng Alembic cho migration CSDL
    File: src/db.py, alembic/
    Lý do: ALTER TABLE thủ công không mở rộng được, không theo dõi phiên bản
    Kết quả mong đợi: Alembic khởi tạo, migration hiện tại được chuyển đổi, startup dùng alembic upgrade head

[ ] TASK-A02 — Thêm ràng buộc FK cho StudyPlan.course_id
    File: src/models/orm.py
    Lý do: Thiếu toàn vẹn tham chiếu
    Kết quả mong đợi: ForeignKey("courses.id") được thêm kèm migration

[ ] TASK-A03 — Refactor conversations.send() thành các hàm nhỏ hơn
    File: src/services/conversations.py
    Lý do: Hàm 105 dòng với 7+ trách nhiệm
    Kết quả mong đợi: Hàm được tách thành gọi orchestrator, lưu trữ, và serialization

[ ] TASK-A04 — Dùng numpy vectorized trong vector store Knowledge Hub
    File: src/services/knowledge_hub_database.py
    Lý do: Cosine similarity Python thuần chậm hơn ~100 lần
    Kết quả mong đợi: Phép toán ma trận numpy, nhất quán với cách tiếp cận retrieval.py
```

### Giai đoạn 4 — Hoàn thiện (Chất lượng Code)

```text
[ ] TASK-P01 — Gộp các helper _iso() format datetime
    File: src/services/conversations.py, src/api/documents.py, src/api/dashboard.py, src/services/knowledge_hub_database.py
    Lý do: Cùng hàm định nghĩa 4 lần với biến thể nhỏ
    Kết quả mong đợi: Một tiện ích chung duy nhất

[ ] TASK-P02 — Thêm response model có kiểu cho tất cả endpoint API
    File: src/api/*.py
    Lý do: Hầu hết endpoint trả dict[str, Any] — không có type safety hay tài liệu OpenAPI
    Kết quả mong đợi: Pydantic response model cho tất cả endpoint

[ ] TASK-P03 — Trích xuất hằng số trạng thái sang StrEnum
    File: src/models/orm.py
    Lý do: Tuple thuần không có type safety
    Kết quả mong đợi: Lớp StrEnum cho trạng thái tài liệu, vai trò, nhãn liêm chính
```

---

## Trạng thái xử lý (2026-10-03, D-79, D-80)

Đối chiếu từng mục với code trước khi sửa. Kiểm tra lần cuối:
- `ruff check` + `ruff format --check` đạt; `pytest` 156 passed, chạy cả trên venv cài mới từ `requirements.txt`;
- UAT toàn bộ `UAT_20261003_1841`: 16 Pass / 0 Fail / 22 Blocked, không hồi quy;
- frontend: `tsc` sạch, lint 0 lỗi, `build` đạt; thử bằng trình duyệt Edge trên bản build production.

| Mục | Kết quả |
|---|---|
| C-01, C-02 | **Một phần.** Đã che 2 key bị chép nguyên văn trong chính báo cáo này. `.env` **chưa từng** lên git ở bất kỳ nhánh nào (`git log --all -- .env` rỗng). Key đã xuất hiện trong báo cáo nên **cần chủ key thu hồi và cấp lại** (Gemini, AI log) |
| H-01 / S-02 | **Đã sửa.** `docker-compose.yml` lấy `POSTGRES_USER/PASSWORD/DB` từ `.env`; thiếu mật khẩu thì compose báo lỗi, không có giá trị mặc định |
| H-02 | **Đã sửa.** Phiên hết hạn được dọn mỗi lần đăng nhập. Phiên lưu trong DB/Redis là việc H-1 của Hùng |
| H-03 | **Đã sửa.** Job tài liệu chạy trong `ThreadPoolExecutor` có trần (`JOB_MAX_WORKERS`, mặc định 2); job thừa xếp hàng |
| H-04 / S-03 | **Đã sửa.** CORS chỉ mở `GET/POST/PUT/PATCH/DELETE` và 4 header frontend dùng. Bỏ `allow_credentials` vì xác thực bằng Bearer, không dùng cookie. Đã thử: preflight hợp lệ 200; header lạ hoặc origin lạ 400 |
| H-05 / P-02 | **Đã sửa.** Cache ma trận embedding là LRU, tối đa 256 phiên bản |
| H-06 / S-05 | **Đã sửa một phần.** Giới hạn đăng ký theo IP (`AUTH_MAX_REGISTRATIONS_PER_HOUR`, mặc định 10, cần chốt). Chưa có CAPTCHA hay xác minh email |
| M-01 | **Đã sửa.** Bộ đếm đăng nhập sai không tạo khóa khi chỉ hỏi, và dọn các khóa quá cửa sổ |
| M-03 / P-03 | **Đã sửa.** `_history` chỉ đọc 13 tin cuối và trả 6 lượt; prompt cũng chỉ dùng 6 lượt |
| M-04 / P-04 / P-05 | **Đã sửa.** `/admin/costs` gộp nhóm bằng SQL; `/admin/costs` và `/admin/audit` chỉ tra tên user có mặt trong kết quả. Kết quả giống hệt bản cũ trên bản sao DB thật |
| M-05 / P-01 | **Đã sửa.** Vector store của Knowledge Hub tính cosine bằng NumPy |
| L-03 | **Đã sửa.** Bỏ import thừa |
| Phát hiện thêm | Các endpoint xác thực khai báo `async def` nhưng gọi DB và hash scrypt đồng bộ, làm chặn event loop của cả server. Đã đổi sang `def` để chạy trong threadpool |
| M-02 | **Đã sửa.** `send()` tách thành `_candidate_courses`, `_validated_input`, `_user_message` (idempotent), `_answer`; hành vi giữ nguyên |
| M-06 | **Đã sửa.** Worker dọn dữ liệu chạy theo lịch cố định 24 giờ, không trôi; dùng `Event` nên dừng ngay khi tắt app |
| M-07 / S-04 | **Đã sửa (theo phương án CSP).** `frontend/src/proxy.ts` đặt CSP có nonce cho từng request: script không có nonce và handler inline (`onerror=`) đều bị chặn. Đã thử trên Edge: đăng nhập demo, chat, đọc tài liệu (ảnh blob), iframe PDF của GV đều chạy, không vi phạm CSP; HTML chèn `<img onerror>` bị chặn. Chưa chuyển sang cookie httpOnly (phải làm lại xác thực, kèm chống CSRF) |
| M-08 | **Đã sửa.** `study_plans.course_id` có khóa ngoại tới `courses.id` (migration 0002); dòng mồ côi bị chặn |
| M-09 | **Đã sửa.** Alembic (`alembic.ini`, `migrations/`): mốc 0001 = schema hiện tại, 0002 = khóa ngoại M-08. DB cũ chưa có Alembic được đưa về mốc bằng các bước `_migrate_*` cũ, `stamp` rồi `upgrade`. Đã thử: DB mới và bản sao DB thật đều lên 0002, schema giống nhau, dữ liệu giữ nguyên, `alembic check` không còn lệch |
| M-10 | **Đã sửa.** Lỗi job phân loại `DB_UNAVAILABLE` / `DATA_*` / `INTERNAL_*`, log kèm `job_id`. DB lỗi khi đang ghi trạng thái "failed" thì không làm chết thread |
| M-11 | **Đã sửa.** RAGAS và `langchain-community` (ghim `<0.4`) chuyển sang `eval/requirements.txt`; app không còn bị ghim. Bỏ thêm `chromadb`, `langchain-chroma` không dùng |
| M-12 | **Đã sửa (giảm thiểu).** Nâng trần threadpool AnyIO từ 40 lên 100 (`HTTP_THREAD_LIMIT`), để các câu chat đang chờ LLM không chặn API khác. Stream (SSE) vẫn là hướng lâu dài |
| L-01, L-02, L-07 | **Đã sửa.** Gộp 5 bản `_iso` / `_aware` vào `src/services/formatting.py` (`iso`, `aware`), hợp đồng `null` ghi trong docstring. Sửa thêm: API tài liệu trước đây xuất giờ không múi giờ |
| L-04 | **Đã sửa.** Mặc định `127.0.0.1` ở config, `.env.example`, `make run`; Dockerfile vẫn `0.0.0.0` vì chạy trong container |
| L-05 | **Đã sửa.** `VersionState`, `Role`, `IntegrityLabel`, `QuizKind`, `QuizState` là `StrEnum`; tên hằng cũ giữ làm alias, giá trị lưu DB không đổi |
| L-08 | **Đã sửa.** `DEFAULT_CONVERSATION_TITLE` dùng chung |
| L-06 | **Không sửa, có lý do.** Gói `cn` không phải tiện ích tối thiểu: nó thay thế `clsx` + `tailwind-merge` (gộp class Tailwind để `className` ghi đè được). Bỏ đi thì phải cài lại 2 gói kia |
| Mục 9 (test), TASK-P02 | **Chưa làm, chờ quyết định.** Test mới mâu thuẫn với luật nhóm giai đoạn MVP (không viết unit test mới, R-08). Response model cho mọi endpoint là thay đổi lớn: model lọc trường nên dễ làm mất dữ liệu frontend đang dùng |
| Mục 12 (tài liệu) | Báo cáo ghi README.md / ARCHITECTURE.md "✅ Có" nhưng hai file này vẫn là bản mẫu của template. Kiến trúc thật xem `docs/documentions/mo_ta_du_an_hien_tai.md` |
