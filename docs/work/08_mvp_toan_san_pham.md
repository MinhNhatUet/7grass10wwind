# 08 — MVP toàn sản phẩm (UC-11)

- **Ngày:** 25–26/09/2026 · **Nhánh:** `feat/BL-03-tv1-eval-mvp` (chưa commit)
- **Yêu cầu:** "làm một MVP hoàn chỉnh là làm hết của mọi người luôn". Người dùng chọn SQLite + SQLAlchemy, embedding lưu trong SQLite + numpy, pypdf + python-pptx.
- **Liên quan:** BL-04…BL-24, BL-35 (owner gốc TV2/TV3/TV4 — **cần báo nhóm**); FR-01…FR-12; BR-01…BR-11; PRD 9–11; UI-01…UI-10. Quyết định D-20…D-26.
- **Kết quả:** backend + frontend chạy thật end-to-end với 1 sách thật đã Published. Thử bằng trình duyệt tự động chưa làm được (không có Chrome cho Playwright).

## File chính

- Backend: `src/db.py`, `src/models/orm.py` (16 bảng theo PRD 9.1), `src/services/{acl,audit,storage,ingestion,retrieval,documents,policy,conversations,errors}.py`, `src/services/assistants/{__init__,academic,learning,hub}.py`, `src/api/{deps,auth,documents,conversations,sources,dashboard,admin}.py`, `src/main.py` (+ `/api/v1/health`, `/api/v1/ready`), `src/config.py` (ngưỡng đề xuất), `src/services/auth.py` (chuyển sang DB).
- Script: `scripts/seed_users.py` (seed DB), `scripts/import_books.py` (đúng luồng HITL).
- Frontend: `src/lib/{api,useSession,messages}.ts`, `src/components/{AppShell,VersionPreview,useManagedCourse}.tsx`, trang `chat`, `lecturer/{documents,review,dashboard}`, `admin`, cập nhật `courses`, CSS.
- `requirements.txt`: sqlalchemy, pypdf, python-pptx, python-multipart, numpy. `.env` / `.env.example`: `DATABASE_URL` → SQLite (giá trị cũ là mẫu Postgres của template).
- Docs: `docs/plans/UC-11_*.md`, `docs/handover/huong_dan_chay.md`, decision log, open questions (Q-17, Q-18).

## Sự cố và cách xử lý

1. `DATABASE_URL` trong `.env` là giá trị mẫu Postgres → lỗi `psycopg`. Đã đổi sang SQLite (D-20).
2. Index lỗi `EMBEDDING_RateLimitError`. Lô 64 đoạn sách thật (~100.000 ký tự) vượt giới hạn token/phút của Gemini; lô 8 đoạn thì chạy được. Đã giảm lô xuống 8, nghỉ 3 giây giữa các lô, và chờ tăng dần khi gặp 429 (D-25). Retry → Published sau 225 giây.
3. Người dùng hỏi "thêm API gì": không cần thêm API/key nào.

## Kiểm tra (kết quả thật)

- `ruff check` + `ruff format --check` (src, tests, eval, scripts mới): pass. `pytest tests/` (test có sẵn): 5 passed.
- `npm run typecheck`, `npm run build`: pass, 9 route.
- `import_books.py` TRR-07 (155 trang, 182 chunk): trích xuất → Draft (5 cảnh báo trang) → gửi duyệt → reviewer duyệt → index → **Published**.
- API end-to-end (TestClient, LLM/embedding thật):
  - Academic: "Đồ thị được định nghĩa như thế nào?" → `answered`, citation mở đúng trang 91; xin đáp án bài tập → `integrity_redirect`; câu ngoài kho → `insufficient_evidence`; Hub → tìm được tài liệu.
  - Phân quyền: SV2 không thấy tài liệu môn 1, không tạo hội thoại môn 1 (403), không đọc hội thoại hay citation của SV1 (404); admin không đọc hội thoại, không tạo hội thoại (403).
  - Idempotency: cùng key → cùng message; cùng key khác body → 409.
  - Tài liệu: SV upload → 403; file giả đuôi .pdf → 422; SV không xem preview bản nháp (404), Hub không lộ bản Draft; GV không được phân công duyệt → REVIEW_NOT_ASSIGNED; sai revision → REVISION_CONFLICT; từ chối không lý do → REASON_REQUIRED.
  - Khóa khẩn cấp: Hub về 0, message cũ bị che bằng thông điệp "nguồn không còn khả dụng", mở citation → 410; mở khóa lại được.
  - Feedback không chia sẻ → dashboard không thấy nội dung; SV/GV môn khác xem dashboard → 403; `/metrics` đúng phạm vi; health/ready OK.
  - Learning: explain có citation; lộ trình thiếu số ngày/phút → hỏi lại; 5 ngày × 45 phút → đúng 45/ngày, tổng 225/225, xác nhận → Confirmed → InProgress. Tự kiểm tra với câu tiếng Việt ngắn bị cổng bằng chứng chặn (điểm 0,544 < 0,55); câu rõ hơn → 3 câu hỏi (Q-17).

## Còn lại / cần quyết định

- Q-17: hiệu chỉnh ngưỡng bằng chứng. Q-18: người duyệt cho COURSE-02/03. D-23…D-26 đang là đề xuất.
- Báo TV2/TV3/TV4: đã làm thay phần backend, RAG và frontend (bản tối giản).
- Chưa kiểm tra giao diện bằng trình duyệt tự động (thiếu Chrome); người dùng nên chạy thử theo `docs/handover/huong_dan_chay.md` mục 5.
- Chưa commit.
