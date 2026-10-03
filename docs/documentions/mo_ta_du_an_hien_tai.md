# Mô tả dự án hiện tại — EDU-04 "Kho tri thức hỗ trợ học thuật X"

Cập nhật: 2026-09-30 · Nhánh `ndmnhat` · Nhóm "7 cỏ 10 gió" (AI20K Build Phase)

Tài liệu này mô tả **trạng thái thực tế của mã nguồn** tại thời điểm cập nhật. Phạm vi MVP và các điểm cần cải tiến: `PRD_v2_MVP_edu04.md`. Có thể dùng để giới thiệu dự án hoặc bàn giao.
- Yêu cầu gốc: `PRD_edu04.md`, `backlog_edu04.md`, `wireframe&UIflow_edu04.md`.
- Các chỗ lệch so với PRD: `docs/decisions/decision_log.md` (D-xx).
- Cách chạy chi tiết: `docs/handover/huong_dan_chay.md`.

---

## 1. Sản phẩm làm gì

Trợ lý học thuật dùng RAG trên kho tài liệu môn học. **Mọi câu trả lời học thuật đều có trích dẫn** (tài liệu và trang) và chỉ dùng tài liệu mà người hỏi được phép đọc.

| Thành phần | Chức năng |
|---|---|
| **Academic Assistant** | Hỏi đáp có trích dẫn, bấm vào trích dẫn để mở đúng trang tài liệu |
| **Learning Assistant** | Giải thích theo mức độ; tự kiểm tra (tự luận ngắn do AI đánh giá, trắc nghiệm A–D, flashcard, điền khuyết); chẩn đoán kiến thức nền; lập lộ trình học |
| **Knowledge Hub** | Tìm tài liệu hoặc đoạn liên quan trong kho được phép đọc |
| **Luồng tài liệu** | Giảng viên tải lên → người kiểm duyệt duyệt → phát hành → có thể thu hồi (lưu phiên bản, có audit) |
| **Learning & Quiz** | Trung tâm học của sinh viên; Quiz Builder của giảng viên (đề luyện tập / kiểm tra / giữa kỳ / cuối kỳ, chấm ở server) |
| **Quản trị** | Người dùng, quyền theo môn, audit, số liệu vận hành |

Người dùng **không cần chọn môn hay trợ lý**. Router (LLM) tự chọn môn trong số các môn người dùng được phép và chọn trợ lý phù hợp (D-27).

## 2. Vai trò và tài khoản demo

| Vai trò | Quyền chính |
|---|---|
| `student` | Chat, thư viện, học tập, lộ trình, làm đề của các môn được ghi danh |
| `lecturer` | Như sinh viên + tải tài liệu, quản lý phiên bản, soạn đề cho môn mình phụ trách |
| `reviewer` | Duyệt / từ chối / thu hồi tài liệu các môn được giao |
| `admin` | Quản lý người dùng, quyền, audit, số liệu, chi phí AI. **Không** dùng Hỏi đáp và không truy cập nội dung học tập (D-61) |

**Demo hiện tại chỉ dùng môn SE101 Công nghệ phần mềm** (D-47, D-48). Dữ liệu thật nằm ở `data/artifacts` (output pipeline MinerU: inventory/metadata, chunk, trang, ảnh công thức; PDF gốc môn CNPM ở `data/artifacts/pdf`). Nạp bằng `python scripts/seed_cnpm.py --confirm-demo-usage [--reset]`: 15 bộ slide qua luồng tải lên → duyệt → phát hành, **chunk lấy từ artifacts** (76 chunk), app tự embedding (artifacts không có embedding). Script cũng ghi `data/manifest.cnpm.json` dùng cho eval, `seed_users.py` và `import_books.py`. Mật khẩu chỉ nằm trong `.env` (`DEMO_CNPM_*_PASSWORD`, `DEMO_KIEMDUYET01_PASSWORD`), không ghi ở đây.

| login_id | Vai trò | Môn |
|---|---|---|
| sinhvien | student | SE101 |
| giangvien | lecturer | SE101 |
| quantri | admin | — |
| kiemduyet01 | reviewer | SE101 (người duyệt phía sau, cần cho luồng HITL — không dùng khi demo) |

Dữ liệu dev cũ (3 môn tạm COURSE-01..03, sách dev, tài khoản và hội thoại cũ) đã được gỡ khỏi `data/` và DB; bản sao nằm trong `backup/` (gitignore). Audit log giữ nguyên (BR-11).

## 3. Kiến trúc

```
Next.js 16 (frontend/, cổng 3000)
   │  fetch ${NEXT_PUBLIC_API_URL}/api/v1/...  (Bearer token)
   ▼
FastAPI (src/main.py, cổng 8000)
   ├─ api/          auth · conversations · documents · sources · quizzes · dashboard · admin
   ├─ agents/       LangGraph orchestrator: policy → router → academic | learning | hub | clarify
   ├─ services/     acl · retrieval · ingestion · documents · conversations · course_quiz · plan_calendar · policy · audit · llm
   └─ models/       SQLAlchemy ORM (SQLite data/app.db)
         ▼
   LLM qua get_llm() (OpenAI-compatible)  ·  Embedding Gemini 768 chiều  ·  Kho file content-addressed (data/)
```

### 3.1 Luồng một câu hỏi
1. **Policy:** chặn yêu cầu vi phạm liêm chính học thuật (xin lời giải bài tập, BR-06) và dấu hiệu prompt injection (BR-09).
2. **Router** (`agents/nodes/orchestration.py`): chọn môn trong các môn được phép và chọn trợ lý; sinh `search_terms` tiếng Anh vì sách là tiếng Anh; biết môn nào chưa có tài liệu. Trợ lý có thể bị ép qua API (`assistant`, `learning.action`), nhưng vẫn qua policy và vẫn phải chốt môn.
3. **Retrieval** (`services/retrieval.py`): lọc quyền **trước** bằng SQL + ACL, chỉ lấy phiên bản Published hiện hành, chỉ nạp embedding của các phiên bản đó, rồi tính cosine bằng numpy để lấy top-k. Có ngưỡng `retrieval_min_score` (evidence gate): không đủ căn cứ thì trả lời "không đủ nguồn" chứ không bịa.
4. **Trợ lý** (`services/assistants/*`): gọi LLM qua `call_json` (tự thử lại một lần khi JSON lỗi). Nội dung tài liệu luôn được coi là dữ liệu, không phải chỉ dẫn.
5. **Kiểm tra lại quyền trước khi trả** (BR-03), lưu message, citation, usage và audit.

### 3.2 Luồng tài liệu
Tải lên → trích xuất + chia đoạn (~2400 ký tự, chồng lấn 300) → **embedding ngay khi tải lên** (D-34; chỉ mục tạm không tham gia tìm kiếm) → gửi duyệt → reviewer duyệt / từ chối → index phần còn thiếu → **Published**. Thu hồi hoặc lưu trữ thì ngừng phục vụ ngay. Trang PDF gốc được render thành ảnh ở server (`pypdfium2`), nên xem được cả sách không cho tải (D-31).

### 3.3 Các quy tắc bắt buộc (enforce ở server)
| BR | Cách làm |
|---|---|
| BR-02 | Không tin role / user_id / course_id từ client; mọi thứ lấy theo token + DB |
| BR-03 | Lọc ACL trước retrieval, kiểm lại trước khi gọi LLM và trước khi trả; không có quyền thì trả 404 (không lộ sự tồn tại) |
| BR-04 | Câu trả lời học thuật phải có citation hợp lệ |
| BR-06 | Không đưa lời giải bài tập; đề kiểm tra chỉ trả điểm, không trả đáp án |
| BR-09 | Tài liệu là dữ liệu; có chặn injection |
| BR-12 | Không commit `.env`, `data/`, dữ liệu holdout (`data/` đã được gỡ khỏi lịch sử git) |

## 4. Dữ liệu (bảng chính)

- `users`, `courses`, `memberships` (can_read / download / upload / review, valid_to)
- `documents`, `document_versions` (Draft → NeedsReview → Approved/Indexing → Published → Archived/Revoked; Failed), `chunks` (kèm embedding, locator trang), `ingestion_jobs`, `approvals`
- `conversations` (có thể gắn `document_id` để hỏi riêng một tài liệu — D-33), `messages` (payload: quiz/plan/mcq…), `citations`, `feedback`
- `study_plans` (phiên bản, trạng thái Draft/Confirmed/InProgress/Paused/Completed; buổi học có trạng thái)
- `course_quizzes`, `quiz_attempts` (D-38)
- `audit_events`, `usage_events`, `idempotency_records`

## 5. API (tiền tố `/api/v1`)

| Nhóm | Endpoint tiêu biểu |
|---|---|
| Xác thực | `POST /auth/login`, `/auth/logout`, `/auth/register` (luôn tạo sinh viên chưa có môn), `GET /me`, `/me/courses` |
| Hội thoại | `POST /conversations` (tuỳ chọn `course_id`, `document_id`), `POST /conversations/{id}/messages` (tuỳ chọn `assistant`, `learning{action,count,topic,goal,days,minutes_per_day,plan_id}`), `GET/PATCH/DELETE`, `DELETE /conversations` (xoá tất cả) |
| Nguồn | `GET /citations/{id}/source`, `/chunks/{id}/source`, trang/ảnh trang của phiên bản |
| Học tập | `/learning/quizzes/{message_id}/answers`, `/learning/plans` (+ confirm, status, sessions, `calendar.ics`), `/learning/self-checks`, `/learning/topics` |
| Đề giảng viên | `/course-quizzes` CRUD + `/status` + `/results`, `/course-quizzes/{id}/attempts`, `/quiz-attempts/{id}/submit` |
| Tài liệu | `/documents` (+ versions, lock, download), `/versions/{id}/submit | decision | withdraw | retry`, `/manage/versions`, `/review/versions/{id}/preview|original`, `/jobs/{id}` |
| Dashboard / Admin | `/dashboard/*` (tổng quan, lịch sử, feedback), `/users`, `/courses`, `/audit`, `/metrics` |

## 6. Frontend (`frontend/`, Next.js 16 + React 19 + Tailwind 4, giao diện của TV4)

| Trang | Nội dung |
|---|---|
| `/login` | Đăng nhập bằng login_id (không bắt buộc email), đăng ký |
| `/` | Chat: sidebar lịch sử, hỏi về một tài liệu, thẻ học (quiz, trắc nghiệm, flashcard, điền khuyết, lộ trình, chẩn đoán), panel xem nguồn |
| `/library` | Thư viện tài liệu được phép đọc, đọc trang gốc (cuộn dọc), nút "Hỏi về tài liệu này" |
| `/learning` | Sinh viên: Trung tâm học (bắt đầu nhanh, ôn tập theo chủ đề — chọn mục từ tài liệu, chọn hình thức và số câu, đề giảng viên giao có đếm giờ, lịch sử tự kiểm tra). Giảng viên / reviewer: Quiz Builder |
| `/learning/plans` | Lộ trình học: tạo bằng AI, tiến độ, xác nhận, ôn tập theo từng buổi, Google Calendar / `.ics` |
| `/hub/manage`, `/hub/review`, `/dashboard` | Giảng viên / reviewer: quản lý tài liệu, duyệt, tổng quan (trong khung chung, D-59) |
| `/dashboard`, `/admin/*` | Tổng quan giảng viên; quản trị người dùng, giám sát, quota |
| `/admin/costs` | Chi phí AI (D-60) |

Về hiển thị nguồn trong bài tập: khi vừa tạo đề hay lộ trình thì **không hiện nguồn**. Dẫn chứng (đoạn trích, tài liệu, trang, nút mở nguồn) chỉ hiện **sau khi** người học chọn đáp án, lật thẻ hoặc bấm "Kiểm tra".

## 7. Chạy và kiểm tra

```bash
# Backend (Python 3.11+, .venv)
pip install -r requirements.txt && cp .env.example .env
python scripts/seed_cnpm.py --confirm-demo-usage   # môn SE101 + 3 tài khoản demo + tài liệu (D-47)
uvicorn src.main:app --reload --port 8000        # GET /health

# Frontend
cd frontend && npm ci
# frontend/.env.local: NEXT_PUBLIC_API_URL=http://localhost:8000  (gắn lúc build)
npm run dev                                       # http://localhost:3000

# Kiểm tra
ruff check src/ tests/  ·  pytest tests/ -v  ·  cd frontend && npx tsc --noEmit
```

Cấu hình chính (`src/config.py` / `.env`):
- LLM: `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`
- Embedding: `EMBEDDING_PROVIDER=gemini`, `GEMINI_API_KEY`, `EMBEDDING_DIMENSION=768`; có batch / backoff cho giới hạn free tier (D-25)
- Tham số khác: `EMBED_ON_UPLOAD`, `RETRIEVAL_TOP_K`, `RETRIEVAL_MIN_SCORE`, `DAILY_QUESTION_QUOTA`, `DATABASE_URL`

Đánh giá (`eval/`): bộ chạy benchmark, RAGAS (chỉ số retrieval và câu trả lời), đánh giá router, rubric. Dataset holdout không nằm trong repo (BR-12).

## 8. Hạn chế và việc còn mở

- Gemini embedding free tier giới hạn khoảng 1000 request/ngày. Hết quota thì trả 503 `EMBEDDING_QUOTA`, chat vẫn báo lỗi rõ ràng.
- Chỉ môn SE101 có dữ liệu; 8 môn thật còn lại trong `data/artifacts` chưa nạp vì chưa có PDF gốc. Chunk artifacts lớn (~2.000 ký tự, nhiều trang); trang trích dẫn được suy ra theo `page_map` (D-49, D-50, D-57).
- Google Calendar là link thêm sự kiện + file `.ics`, **không** đồng bộ OAuth hai chiều (D-37).
- Quiz Builder là tính năng ngoài PRD 7.2 (D-38), cần báo nhóm.
- Các prototype độc lập của TV4 (`frontend/luno-admin-dashboard/`, `paper-document-editor/`, `transform.js`) chờ TV4 xác nhận trước khi xoá.
- Nhánh `ndmnhat` trên remote chưa được force-push sau khi gỡ `data/` khỏi lịch sử (người dùng tự chạy).
