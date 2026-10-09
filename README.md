# EDU-04 — Kho tri thức hỗ trợ học thuật X

Trợ lý học thuật dùng RAG cho Trung tâm X (AI20K Build Phase, đội **7 cỏ 10 gió**). Sinh viên hỏi đáp và học trên
**chính tài liệu đã được giảng viên duyệt**, mọi khẳng định học thuật đều có trích dẫn mở được tới đúng trang nguồn.

- **Academic Assistant:** hỏi đáp có trích dẫn [n] tới tài liệu, trang; thiếu căn cứ thì nói rõ, không bịa.
- **Learning Assistant:** giải thích theo 3 mức, câu hỏi tự kiểm tra, trắc nghiệm, flashcard, điền khuyết, chẩn đoán
  kiến thức nền; **lộ trình học** theo tiến độ (đã học tới bài N → bài đánh giá → chọn lộ trình → các bước cụ thể).
- **Knowledge Hub:** tìm và mở tài liệu trong phạm vi được phép (vector + BM25 + rerank).
- **Quy trình tài liệu của giảng viên:** upload → duyệt (người duyệt khác người upload) → phát hành → thu hồi, có audit.
- **Quản trị:** người dùng và quyền theo môn, khóa khẩn cấp tài liệu, quota, chi phí AI, giám sát.

Kiến trúc: [ARCHITECTURE.md](ARCHITECTURE.md) · sơ đồ: [docs/architecture_diagram.md](docs/architecture_diagram.md) ·
đánh giá: [eval/results/report.md](eval/results/report.md), [eval/results/manual_cases.md](eval/results/manual_cases.md).

🎬 **Video demo:** [Xem trong repo](docs/video_demo.mp4) · [Xem trên Google Drive](https://drive.google.com/drive/folders/1WUec36eUs-VTSWVsNQLaxBsCFIy5AB4s?usp=sharing).

## Yêu cầu

- Python 3.11 (bản CI dùng), Node.js 20+
- Key LLM tương thích OpenAI và key embedding (Gemini hoặc OpenAI)
- Docker — tùy chọn, để chạy `docker compose`

## Cài đặt

```bash
git clone https://github.com/AI20K-Build-Phase-Cohort-4/P-134.git
cd P-134

# Backend
python3.11 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # rồi điền key (xem bảng dưới)

# Frontend
cd frontend && npm ci && cd ..

# Hook ghi log AI (chạy một lần)
bash scripts/setup_hooks.sh                                       # Linux / macOS / Git Bash
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1  # Windows
```

### Dữ liệu ban đầu

```bash
python scripts/seed_users.py                          # môn học, người dùng, quyền theo môn
python scripts/seed_cnpm.py --confirm-demo-usage      # demo môn Công nghệ phần mềm (SE101) từ data/artifacts
```

Tài liệu mới do giảng viên upload qua giao diện **Quản lý tài liệu**, đi qua duyệt rồi mới vào tìm kiếm. Dữ liệu
(`data/`) không nằm trong repo (BR-12).

## Chạy

```bash
make dev                 # Windows: backend :8000 + frontend :3000 (scripts/dev.ps1)
make run                 # chỉ backend, http://localhost:8000 (Swagger: /docs, health: /health)
cd frontend && npm run dev   # chỉ frontend, http://localhost:3000
```

Bằng Docker:

```bash
docker compose up -d db      # chỉ Postgres + pgvector (localhost:5432) cho make dev / make run
docker compose up --build    # db + backend :8000 + frontend :3000
```

Image backend không chứa `.env`, `data/`, bản sao DB; `./data` được mount lúc chạy nên container dùng đúng DB và tài
liệu đã có. DB nằm ở service `db` (volume `pgdata`, D-84). Tắt backend/frontend đang chạy ngoài Docker (`make dev`)
trước khi chạy cả stack — trùng cổng.

**Đăng nhập demo:** đặt `DEMO_LOGIN_ENABLED=true` (chỉ môi trường demo, luôn tắt ở production), trang đăng nhập
hiện nút "Đăng nhập demo" theo vai trò sinh viên / giảng viên.

## Biến môi trường

Đầy đủ trong [.env.example](.env.example). Các biến chính:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | — | LLM tương thích OpenAI (ưu tiên). `OPENAI_API_KEY` / `MODEL_NAME` là fallback |
| `LLM_TIMEOUT_SECONDS` | `60` | Timeout mỗi lần gọi LLM |
| `EMBEDDING_PROVIDER` | `gemini` | `gemini` hoặc `openai` |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` | — | Model và số chiều embedding (ví dụ `gemini-embedding-001`, `768`) |
| `GEMINI_API_KEY` | — | Key cho embedding Gemini |
| `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL` | — | Key/endpoint riêng cho embedding OpenAI |
| `RETRIEVAL_MIN_SCORE` | `0.55` | Ngưỡng bằng chứng; đổi model embedding phải hiệu chỉnh lại |
| `DATABASE_URL` | `sqlite:///./data/app.db` | DB. Dùng Postgres + pgvector (D-84): `postgresql+psycopg2://edu04:<mật khẩu>@localhost:5432/edu04` |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Origin frontend, phân tách bằng dấu phẩy |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Địa chỉ backend cho frontend |
| `DEMO_LOGIN_ENABLED` | `false` | Bật nút đăng nhập demo |
| `DAILY_QUESTION_QUOTA` | `200` | Số câu hỏi mỗi người mỗi ngày |
| `LEARNING_ASSESSMENT_MAX_QUESTIONS` | `15` | Số câu tối đa của bài đánh giá lộ trình |
| `AUTH_SESSION_TTL_MINUTES` | `480` | Thời hạn phiên đăng nhập |
| `UPLOAD_MAX_MB` | `100` | Dung lượng tối đa mỗi tệp upload |
| `LLM_PRICE_INPUT_PER_1M`, `LLM_PRICE_OUTPUT_PER_1M`, `USD_TO_VND` | `0.10`, `0.40`, `26000` | Bảng giá ước tính cho trang Chi phí AI |
| `AI_LOG_API_KEY` | — | Key cá nhân để gửi log AI lên hệ thống chấm |

## Câu hỏi mẫu (môn Công nghệ phần mềm)

| Trợ lý | Câu hỏi |
|---|---|
| Academic | "Kiểm thử hộp đen là gì? Khác gì kiểm thử hộp trắng?" |
| Academic | "Phân tích giá trị biên dùng để làm gì?" |
| Academic | "Mô hình thác nước có những giai đoạn nào?" |
| Learning — giải thích | "Giải thích từng bước cách thiết kế ca kiểm thử bằng phân vùng tương đương" |
| Learning — tự kiểm tra | "Cho mình 5 câu trắc nghiệm về quản lý yêu cầu" |
| Learning — lộ trình | Trang **Học tập → Lộ trình**: chọn "đã học tới bài N" → làm bài đánh giá → chọn lộ trình |
| Knowledge Hub | "Tìm tài liệu về kiểm thử đơn vị" |
| Ngoài phạm vi | "Cách nấu phở bò?" → hệ thống hỏi làm rõ, không trả lời có nguồn |
| Liêm chính | "Giải hộ bài tập lớn, đưa đáp án cuối" → chuyển hướng sang gợi ý, không đưa lời giải (BR-06) |

## Kiểm thử và đánh giá

```bash
make lint                      # ruff check src/ tests/
make test                      # pytest (không gọi LLM thật)
python -m eval.uat.run_uat_mvp # UAT mức API trên bản sao DB, backend riêng cổng 8100
```

Kết quả: [eval/results/report.md](eval/results/report.md), ca kiểm thử có output thật:
[eval/results/manual_cases.md](eval/results/manual_cases.md).

## Cấu trúc thư mục

```
src/
  main.py               FastAPI app, mount router /api/v1, /health
  config.py             Settings đọc từ .env
  api/                  auth, conversations, documents, sources, learning_path, quizzes, dashboard, admin
  agents/               LangGraph: policy → router → academic | learning | hub | clarify
  services/             acl, auth, retrieval, documents, conversations, assistants/, learning_path/, llm
  knowledge_hub/        tìm kiếm lai (vector + BM25 + RRF + rerank)
  ingestion/            pipeline trích xuất PDF/PPTX, chunk, metadata
  models/               ORM (SQLAlchemy) + schema (Pydantic)
frontend/               Next.js
migrations/             Alembic
scripts/                seed dữ liệu, import tài liệu, hook log AI
tests/                  pytest
eval/                   UAT, RAGAS, benchmark, kết quả đánh giá
docs/                   PRD, backlog, kế hoạch, UAT, sơ đồ kiến trúc
```

## AI usage logging

Mọi prompt được ghi vào `.ai-log/session.jsonl` bằng hook và tự gửi lên grading server ở bước pre-push. Không gỡ hoặc
bỏ qua các hook này (`.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json`, `.gemini/settings.json`,
`.github/hooks/hooks.json`, `.agents/hooks.json`). Công cụ web (ChatGPT…) thì log thủ công:

```bash
bash scripts/_pyrun.sh scripts/log_manual.py --tool chatgpt --prompt "What you asked"
```

## License

[MIT](LICENSE)
