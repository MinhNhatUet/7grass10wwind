# Phân công cải tiến sau MVP — EDU-04

| Mục | Nội dung |
|---|---|
| Ngày | 2026-10-03 (cập nhật tiến độ chiều 03/10) |
| Căn cứ | [PRD v2 §7 — Điểm cần cải tiến](PRD_v2_MVP_edu04.md#7-điểm-cần-cải-tiến), đề xuất cải tiến Learning Assistant, [kết quả UAT](../uat/uat_mvp.md#kết-quả-các-lượt-chạy) |
| Trạng thái | **Bản đề xuất**, có cập nhật tiến độ ở [mục 0](#0-đã-làm-được-tính-đến-2026-10-03) và cột việc. Các dòng ghi "cần chốt" phải được cả nhóm xác nhận trước khi làm |

| Thành viên | Mảng | Phạm vi |
|---|---|---|
| **Việt** | Dữ liệu | OCR, chunking, chuẩn bị và nạp dữ liệu môn học |
| **Nhật** (TV1) | Backend — AI | Router, retrieval, các trợ lý, kiểm trích dẫn, eval/UAT |
| **Hùng** | Backend — nền tảng | API, xác thực/phân quyền, DB, job, vận hành, chi phí |
| **Bình** | Frontend | Toàn bộ `frontend/` |

Nguyên tắc chung: **mỗi file có đúng một chủ sở hữu**. Người khác cần sửa thì mở PR và chờ chủ file review, hoặc nhờ chủ file sửa. File dùng chung (mục 3) chỉ được sửa theo quy trình riêng.

---

## 0. Đã làm được (tính đến 2026-10-03)

### Nền MVP (trước khi chia việc)
- MVP chạy đủ 3 vai trò Sinh viên / Giảng viên / Quản trị trên dữ liệu thật SE101. UAT tự động mức API: **16 Pass / 0 Fail / 22 Blocked / 38 ca**. Các ca Blocked đã đạt mọi tiêu chí máy kiểm được, chỉ còn chờ GV chấm, thao tác UI hoặc dataset ([kết quả các lượt](../uat/uat_mvp.md#kết-quả-các-lượt-chạy)).
- CI chạy ruff + pytest (backend), lint + build (frontend). `pytest`: **112 test** (trước đợt này là 24).

### Theo từng người

| Người | Đã làm | Mã |
|---|---|---|
| **Nhật** | • Gỡ code mẫu template, UI cũ.<br>• Log JSON + `X-Request-ID` + mã hỗ trợ.<br>• Chi phí AI (`/admin/costs`).<br>• Đăng nhập demo.<br>• Kiểm trích dẫn **từng câu**: xóa câu có nguồn sai/đã thu hồi, đánh dấu câu thiếu trích dẫn.<br>• Câu hỏi AI soạn phải có **câu trích chứng minh đáp án** (`proof`), lọc câu trùng, đáp án chia đều A–D.<br>• Chuyển LLM sang `gpt-4o-mini` và sửa 4 lỗi P1 phát sinh.<br>• Bộ UAT tự động 38 ca + báo cáo.<br>• Đồng bộ PRD v2, hướng dẫn chạy, mục lục tài liệu | D-60, D-63 → D-74 |
| **Nhật** (tích hợp phần của Việt) | • Đưa pipeline `src/ingestion/` và Knowledge Hub lai (BM25 + vector + RRF) của Việt vào `ndmnhat` bằng merge 3 chiều, không ghi đè D-71 → D-74.<br>• Sửa 3 lỗi phát hiện khi kiểm:<br>  – `GET /documents` bị hạ `page_size` (gây 422);<br>  – reranker xếp theo tỉ lệ phủ âm tiết, Hub chỉ đúng tài liệu đầu **9/14** → xếp theo fusion: **14/14**;<br>  – Hub trả 503 cho cả thư viện khi embedding lỗi → chuyển sang chỉ tìm theo từ khóa | D-75, D-76, D-78 |
| **Nhật** (embedding) | • Gemini free tier hết quota trong ngày nên chuyển embedding sang **OpenAI `text-embedding-3-large`** (key riêng `EMBEDDING_API_KEY`).<br>• Script `backfill_embeddings.py` để embedding lại toàn bộ.<br>• Hiệu chỉnh `RETRIEVAL_MIN_SCORE` 0,55 → **0,42** trên tập dev (20 câu đúng chủ đề / 8 câu lạc đề).<br>• UAT không hồi quy | D-77 |
| **Việt** | • Pipeline dữ liệu `src/ingestion/`: đọc output MinerU, OCR, nhận dạng công thức, chia chunk theo cấu trúc mục, kiểm chất lượng, metadata, danh mục môn (`config/*.yaml`).<br>• Knowledge Hub lai `src/knowledge_hub/`.<br>• Cột `chunks.section`, `reprocess_prechunked`, API `GET /knowledge-hub/search`.<br>• Script rebuild / reindex chunk có section; khoảng 90 test | D-75 |
| **Bình** | • **Chặn job index phát hành lại tài liệu đã thu hồi**: so khớp state/revision trước và sau mỗi lần embedding và trước publish; thu hồi tăng revision và hủy job đang chờ/chạy; 14 test race.<br>• **Lộ trình học che nguồn đã thu hồi** ở chat, chi tiết, danh sách, export; chặn tạo bài từ lộ trình có nguồn đã thu hồi (410); test `test_plan_access.py` | BL-13/14, FR-03.9, FR-08, BR-01/07/10 |
| **Hùng** | Cải thiện giao diện trên nhánh `quanghung` (CSS toàn cục, thanh cuộn). **Chưa merge** vào `ndmnhat`, vì còn kéo lại file đã gỡ `useManagedCourse.ts` | — |

### Việc đã thử nhưng chưa áp
- **Chunk có section (V-1, V-2):**
  - Đã tạo bộ 408 chunk (399 chunk có `section`) và chạy thử trên bản sao DB.
  - Chunk chỉ dài trung bình **324 ký tự** (một mục slide), nhỏ hơn nhiều mục tiêu 400–800 token. Hậu quả: UAT PLAN-01 / PLAN-02 lỗi; câu hỏi ôn tập bị loại hết vì model không chép được câu nguyên văn.
  - **Chưa áp lên DB thật.** Cần gộp các mục nhỏ liền nhau trước.
- **Lịch sử Git:** đã gỡ `docs/work` khỏi lịch sử `ndmnhat` (force push 11:02). Sau đó PR #6, #8 merge từ nhánh `binh` cũ đã đưa các commit cũ (có `docs/work`) trở lại lịch sử. Commit mới nhất vẫn không có file `docs/work`.

---

## 1. Việc cải tiến của từng người

Mức ưu tiên lấy theo PRD v2: **P1** làm trước khi có người dùng thật, **P2** nâng chất lượng, **P3** mở rộng.

### 1.1 Việt — OCR, chunking, dữ liệu

| # | Việc | Mã PRD v2 | Ưu tiên | Kết quả cần bàn giao |
|---|---|---|---|---|
| V-1 | Chia lại chunk theo **mục/trang**, 400–800 token, chồng lấn 50–100 token. Hiện chunk artifacts khoảng 2.000 ký tự và trải tới 12 trang | AI-2 | P2 | Bộ chunk mới theo [hợp đồng chunk](#41-hợp-đồng-chunk-việt--nhật-hùng). Đo lại retrieval cùng Nhật trước khi thay bộ cũ. **Tiến độ:** đã có bộ 408 chunk nhưng quá nhỏ (trung bình 324 ký tự), cần gộp mục; chưa áp |
| V-2 | Gắn **`section`** (tiêu đề chương/mục) cho từng chunk. Hiện `section` = `null` | AI-2, D-44 | P2 | Trường `section` có giá trị; dùng cho chọn chủ đề theo chương và báo độ phủ chủ đề (N-3). **Tiến độ:** đã có cột, migration, hiển thị trong nguồn (D-75); DB thật chưa có giá trị vì chờ V-1 |
| V-3 | **`page_map` chính xác**: kiểm offset → trang, xử lý chân trang lặp, số trang, ảnh công thức, bảng. Đã từng lệch 16 trang (UAT-BUG-20261002-03) | AI-2 | P1 | Script kiểm tra tự động, báo cáo trong `data/artifacts/quality_reports/` |
| V-4 | **OCR cho PDF scan** khi giảng viên tải lên trong app. Hiện PDF scan bị đánh dấu "Cần xem lại" | AI-6 | P3 | Hàm OCR trả về đúng hợp đồng chunk, để `ingestion` gọi được |
| V-5 | **PDF dài khi tạo đề**: tách văn bản theo chương. Hiện giới hạn khoảng 60k ký tự | AI-6 | P3 | Hàm tách chương; Hùng nối vào luồng tạo đề |
| V-6 | **Nạp 8 môn còn lại** trong `data/artifacts`: bổ sung PDF gốc, manifest, quyền sử dụng (Q-09) | OP-6 | P3 | Manifest đầy đủ; nạp qua luồng duyệt (`seed`/`import_prechunked`), không ghi thẳng DB |
| V-7 | Hồ sơ **quyền sử dụng nguồn SE101** cho release gate (dòng Dữ liệu đang "Chưa đạt") | BL-30, Q-09 | P1 | Xác nhận của GV / chủ sở hữu, cập nhật manifest |

### 1.2 Nhật — backend AI, chất lượng câu trả lời, eval

| # | Việc | Mã PRD v2 | Ưu tiên | Kết quả cần bàn giao |
|---|---|---|---|---|
| N-1 | **Eval holdout**: cùng GV soạn và khóa 100 mẫu + safety ≥ 40 ca; chạy benchmark; giữ holdout ngoài repo (BR-12) | AI-1, OP-9 | P1 | `eval/results/<run_id>.md`; đóng ca GATE-01 |
| N-2 | **LLM giám khảo** cho câu hỏi AI soạn (lớp B): loại đáp án sai, câu có nhiều đáp án đúng, câu mơ hồ | AI-5 | P2 | Thêm 1 lượt gọi LLM cho mỗi bộ câu; đo số câu bị loại |
| N-3 | **Độ phủ chủ đề**: khi ôn nhiều chủ đề, báo chủ đề nào không có nguồn và số câu sinh được cho từng chủ đề | Đề xuất LA | P1 | Thêm trường trong `payload`; Bình hiển thị |
| N-4 | **Mỗi buổi trong lộ trình phải có nguồn**: buổi không có nguồn thì không cho xác nhận, thay vì chỉ cảnh báo | Đề xuất LA | P1 | Sửa `learning.py` |
| N-5 | **Reranker** top-20 → top-6; hiệu chỉnh `retrieval_min_score` trên tập dev (Q-17) | AI-4, AI-3 | P2 | Số liệu trước/sau trên tập dev (không dùng holdout). **Tiến độ:** Hub lai + sửa reranker (D-75, D-76); ngưỡng 0,42 cho OpenAI (D-77). Còn thiếu cross-encoder |
| N-6 | **Giảm độ trễ đường AI**: gộp hoặc rút gọn bước router, giảm token prompt. Hiện p95 13,4 s, mục tiêu < 3 s | UX-1 | P1 | Số đo p50/p95 trên UAT |
| N-7 | **Tiến độ học theo chủ đề**, chấm tự luận theo rubric, mức độ khó, ôn lặp lại ngắt quãng (spaced repetition) | Đề xuất LA P2–P3 | P2–P3 | Service `learning_progress`; bảng DB theo [quy trình đổi schema](#3-file-dùng-chung-và-quy-trình-sửa) |
| N-8 | Duy trì **UAT tự động** và điều phối GV chấm 22 ca Blocked | OP-5 | P1 | Báo cáo `docs/uat/uat_mvp_report_<run_id>.md`. **Tiến độ:** bộ chạy có `UAT_SOURCE_DB` để chạy trên DB thử; lượt mới nhất 16 / 0 / 22 |

### 1.3 Hùng — backend nền tảng, vận hành

| # | Việc | Mã PRD v2 | Ưu tiên | Kết quả cần bàn giao |
|---|---|---|---|---|
| H-1 | **Phiên đăng nhập bền vững**: lưu trong DB hoặc Redis, không mất khi restart, chạy được nhiều worker | OP-4 | P1 | `services/auth.py` mới; test đăng nhập / hết hạn / thu hồi |
| H-2 | **Hạn mức lưu thật**: câu hỏi/ngày, token/tháng theo môn/người; API cho admin; dùng chung số liệu chi phí D-60 | UX-3 | P1 | Bảng + API `/admin/quota`; Bình nối giao diện |
| H-3 | **Stream câu trả lời** (SSE) cho `POST /conversations/{id}/messages`; tạo đề từ PDF chạy nền, có trạng thái job | UX-1 | P1 | Endpoint stream + trạng thái job; chốt định dạng sự kiện với Bình và Nhật |
| H-4 | **Hàng đợi job bền vững** + worker riêng, giới hạn chạy đồng thời (tài liệu, tạo đề) | OP-8 | P2 | Thay thread nền trong tiến trình |
| H-5 | **PostgreSQL + Alembic**: kiểm chứng chạy trên Postgres (compose đang cấu hình nhưng chưa thử), migration có phiên bản, sao lưu/phục hồi | OP-3 | P2 | `migrations/`; hướng dẫn backup |
| H-6 | **Chi phí**: thêm chi phí embedding, chốt bảng giá với nhà cung cấp, cảnh báo vượt ngân sách | OP-1 | P1 | Cập nhật `usage.py`, `/admin/costs`. **Lưu ý:** embedding nay dùng OpenAI trả phí (D-77) nhưng chưa được tính vào chi phí |
| H-7 | **Thông báo trong app**: tài liệu được duyệt, đề được phát hành | UX-6 | P3 | Bảng + API thông báo |
| H-8 | **Test bổ sung**: tạo đề từ PDF, chi phí, quyền admin, quota, phiên | OP-5 | P1 | `tests/test_api/`, `tests/test_services/` |
| H-9 | Kiểm chứng `docker compose up --build` đầu cuối (backend + frontend + DB) | BL-29 | P2 | Ghi kết quả vào hướng dẫn chạy |

### 1.4 Bình — frontend

| # | Việc | Mã PRD v2 | Ưu tiên | Kết quả cần bàn giao |
|---|---|---|---|---|
| B-1 | Hiển thị **câu trả lời dạng stream** và tiến độ job tạo đề (phụ thuộc H-3) | UX-1 | P1 | Chat hiện chữ dần; nút hủy |
| B-2 | Trang **Cấu hình hạn mức** nối API thật, bỏ chế độ xem thử (phụ thuộc H-2) | UX-3 | P1 | `/admin/quota` lưu thật |
| B-3 | Chạy **phần UI của UAT** (9 ca + UX-01): nguồn ẩn/hiện đúng lúc, badge `[n]`, dấu "*(chưa có trích dẫn)*", trình duyệt và mobile | OP-5 | P1 | Kết quả ghi vào báo cáo UAT của lượt |
| B-4 | Hiển thị **độ phủ chủ đề** (N-3), **tiến độ học** theo chủ đề và lịch ôn lặp lại (N-7) | Đề xuất LA | P2 | Thẻ/biểu đồ trong `/learning` |
| B-5 | **Thông báo** trong app (phụ thuộc H-7) | UX-6 | P3 | Chuông thông báo trong `MainShell` |
| B-6 | **Dọn frontend**: 17 cảnh báo lint; quyết định xóa prototype `luno-admin-dashboard/`, `paper-document-editor/`, `transform.js`; bỏ `useManagedCourse.ts` và các class CSS chưa dùng (`.glass-*`, `.bg-mesh-radial`) nếu vẫn còn | OP-0, UX-4 | P3 | `npm run lint` 0 cảnh báo; `npx tsc --noEmit` sạch |

### 1.5 Phụ thuộc giữa các việc

| Việc | Cần trước | Bàn giao qua |
|---|---|---|
| V-1, V-2 (chunk mới) → N-3, N-5 (độ phủ, rerank) | Hợp đồng chunk (§4.1) | Bộ chunk mẫu 1 tài liệu để Nhật thử trước |
| H-3 (stream) → B-1 | Định dạng sự kiện SSE (§4.2) | Endpoint chạy trên nhánh tích hợp |
| H-2 (quota API) → B-2 | Schema API trong `schemas.py` | OpenAPI ở `/docs` |
| N-3, N-7 (payload mới) → B-4 | Trường mới trong `payload` (§4.2) | Ví dụ JSON trong PR |
| V-4, V-5 → Hùng nối vào ingestion / tạo đề | Chữ ký hàm (§4.1) | PR có ví dụ đầu vào/đầu ra |
| N-7 cần bảng DB mới | Quy trình đổi schema (§3) | PR sửa `orm.py` do Hùng review |

---

## 2. Quyền sở hữu file

Người sở hữu là người duy nhất được sửa trực tiếp. Cột "Review bắt buộc" là người phải duyệt PR khi có thay đổi ở đó.

### 2.1 Backend `src/`

| Đường dẫn | Chủ sở hữu | Review bắt buộc |
|---|---|---|
| `src/agents/**` (orchestrator, router) | Nhật | — |
| `src/services/assistants/**` (academic, learning, study_tools, hub, kiểm trích dẫn) | Nhật | — |
| `src/services/retrieval.py`, `policy.py` | Nhật | Hùng (vì liên quan ACL, BR-03) |
| `src/services/llm.py` (`get_llm`, embedding) | Nhật | Việt khi đổi embedding |
| `src/services/ingestion.py`, `text_cleaning.py`, `page_render.py` | Việt | Hùng (luồng tài liệu gọi vào) |
| `src/services/documents.py` (luồng tải lên / duyệt / phát hành / job) | Hùng | Việt cho `import_prechunked` và phần chunk |
| `src/services/acl.py`, `auth.py`, `audit.py`, `errors.py` | Hùng | Nhật cho `acl.py` |
| `src/services/conversations.py`, `course_quiz.py`, `usage.py`, `retention.py`, `plan_calendar.py`, `storage.py` | Hùng | Nhật cho prompt và kiểm `proof` trong `course_quiz.py` |
| `src/api/**`, `src/main.py`, `src/db.py`, `src/observability.py` | Hùng | — |
| `src/models/orm.py`, `src/models/schemas.py`, `src/config.py` | **Dùng chung** (§3) | Hùng giữ bản chính |

### 2.2 Dữ liệu, script, eval, test

| Đường dẫn | Chủ sở hữu |
|---|---|
| `data_pipeline/**` (mới, xem §5), `data/artifacts/**` (không commit) | Việt |
| `scripts/seed_cnpm.py`, `import_books.py`, `reprocess_books.py`, `retry_index.py`, `validate_manifest.py` | Việt |
| `scripts/seed_users.py`, `seed_courses.py`, `seed_dev.py` | Hùng |
| `scripts/log_*.py`, `submit_log.py`, `.claude/settings.json` (hook ghi AI log) | **Không ai sửa** (hook chấm điểm) |
| `eval/**` (benchmark, ragas, router, scoring, uat, results) | Nhật |
| `tests/conftest.py` | Dùng chung, Hùng giữ |
| `tests/test_api/**`, `tests/test_services/**` | Người sở hữu module đang được test |
| `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `Makefile` | Hùng (thêm thư viện: §3) |

### 2.3 Frontend `frontend/`

| Đường dẫn | Chủ sở hữu | Ghi chú |
|---|---|---|
| `frontend/**` | Bình | Backend không sửa trực tiếp |
| `frontend/src/lib/api.ts`, `frontend/src/types/**` | Bình | Kiểu dữ liệu phải khớp `schemas.py`; backend báo trước khi đổi API |
| `frontend/Dockerfile`, `package.json` | Bình | Thêm thư viện: §3 |

### 2.4 Tài liệu

| Đường dẫn | Chủ sở hữu |
|---|---|
| `docs/documentions/PRD_v2_MVP_edu04.md`, `mo_ta_du_an_hien_tai.md`, file này | Nhật (người khác gửi nội dung qua PR) |
| `docs/decisions/decision_log.md`, `open_questions.md` | Dùng chung (§3) |
| `docs/uat/**` | Nhật; Bình ghi phần UI vào báo cáo của lượt |
| `docs/handover/huong_dan_chay.md` | Dùng chung: mỗi người sửa đúng mục của mình (dữ liệu: Việt; backend/Docker: Hùng; frontend: Bình; eval/UAT: Nhật) |
| `docs/ui-completion-roadmap.md`, `frontend/README.md` | Bình |
| Tài liệu dữ liệu / manifest (`data_pipeline/README.md`) | Việt |
| `README.md`, `ARCHITECTURE.md`, các file ở thư mục gốc, `docs/guide/**`, `docs/architecture_diagram.md`, `.github/**` | **Giữ nguyên.** File template; `.github/` và `docs/guide/` thuộc CODEOWNERS của ban tổ chức |
| `docs/work/`, `docs/plans/`, `docs/rules/` | Cục bộ từng người (gitignore), không push |

---

## 3. File dùng chung và quy trình sửa

| File / thứ dùng chung | Quy tắc |
|---|---|
| `src/models/orm.py` (schema DB) | Chỉ **thêm** bảng / cột có giá trị mặc định, không đổi tên hay xóa khi chưa có migration. Mỗi thay đổi một PR riêng, Hùng review. Có Alembic (H-5) rồi thì đi kèm file migration |
| `src/models/schemas.py` (hợp đồng API) | Thêm trường mới: không phá client cũ. Đổi/xóa trường: báo Bình trước, sửa cùng PR với frontend hoặc làm 2 bước |
| `src/config.py` + `.env.example` | Biến mới phải có mặc định an toàn và dòng tương ứng trong `.env.example` (không có giá trị thật). Không đổi tên biến đang dùng |
| `requirements.txt`, `frontend/package.json` | Thêm thư viện thì nêu lý do trong PR; Hùng (Python) / Bình (npm) duyệt |
| `docs/decisions/decision_log.md` | Dải số D-xx riêng để không trùng: **Nhật D-75…D-99, Hùng D-100…D-124, Việt D-125…D-149, Bình D-150…D-174** (*cần chốt*). Chỉ thêm dòng mới, không sửa dòng của người khác |
| `docs/handover/huong_dan_chay.md` | Sửa đúng mục của mình |
| `tests/conftest.py` | Chỉ thêm fixture, không đổi fixture đang dùng |

Bắt buộc với mọi người:
- Gọi LLM chỉ qua `get_llm()` / `call_json` (R-12); test không gọi LLM thật.
- Mọi kiểm tra quyền ở server, mặc định từ chối (BR-02, BR-03).
- `ruff check` + `ruff format --check` + `pytest` (backend); `npm run lint` + `npx tsc --noEmit` + `npm run build` (frontend) phải sạch trước khi mở PR.

---

## 4. Hợp đồng cần chốt

### 4.1 Hợp đồng chunk (Việt → Nhật, Hùng)

Đầu ra của pipeline dữ liệu là một file JSON cho mỗi phiên bản tài liệu, giữ định dạng hiện tại của `data/artifacts/chunks/ver_*.json` và nhập bằng `documents.import_prechunked`:

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `id` | string | ✔ | Mã chunk, ổn định giữa các lần chạy |
| `version_id`, `document_id`, `course_id` | string | ✔ | Truy ngược nguồn (PRD 9.1) |
| `title` | string | ✔ | Tên tài liệu (tên sách/bài, không kèm mã) |
| `document_type` | string | ✔ | `lecture_slide`, `textbook`… |
| `section` | string \| null | nên có | Tiêu đề chương/mục (V-2) |
| `locator` | `{type: "page" \| "slide", start, end}` | ✔ | Khoảng trang của chunk |
| `text` | string | ✔ | Nội dung đã làm sạch (bỏ chân trang lặp, số trang) |
| `page_map` | `[[offset, page], …]` tăng dần | ✔ khi chunk > 1 trang | Vị trí ký tự → trang, dùng để trích dẫn đúng trang |

- Kích thước mục tiêu: 400–800 token, chồng lấn 50–100 token (*cần chốt* sau khi đo V-1).
- Đổi định dạng: Việt báo trước, kèm một file mẫu; Nhật chạy lại kiểm tra retrieval, Hùng kiểm tra import.
- Hàm OCR / tách chương (V-4, V-5) nhận `bytes` của PDF và trả về danh sách chunk theo đúng bảng trên.

### 4.2 Hợp đồng API (Hùng, Nhật → Bình)

- Tiền tố `/api/v1`, xác thực bằng `Authorization: Bearer <token>`. Frontend gọi thẳng `NEXT_PUBLIC_API_URL`; origin frontend phải có trong `CORS_ORIGINS`.
- Lỗi: `{"status": "error", "error": {"code", "message", "retryable", "request_id"}}`; mọi response có header `X-Request-ID`. Frontend hiện mã hỗ trợ khi lỗi ≥ 500.
- Tin nhắn trợ lý: `payload.kind` quyết định thẻ hiển thị (`mcq`, `flashcards`, `cloze`, `quiz`, `diagnose`, `triage`, `plan`…). Mỗi mục có `sources` và `evidence[n] = {quote, page, page_end}`; câu hỏi AI soạn có `proof`. Thêm `kind` hoặc trường mới thì Nhật gửi ví dụ JSON trong PR cho Bình.
- Stream (H-3): định dạng sự kiện SSE (`delta`, `citation`, `done`, `error`) do Hùng đề xuất, Nhật và Bình xác nhận (*cần chốt*).
- Nguồn sự thật cho schema là OpenAPI ở `/docs` của backend đang chạy.

---

## 5. Cấu trúc thư mục

```
P-134/
├── src/                         # Backend FastAPI
│   ├── main.py, db.py, observability.py         [Hùng]
│   ├── config.py                                [dùng chung]
│   ├── api/                                     [Hùng]
│   ├── agents/                                  [Nhật]  router LangGraph
│   ├── models/  orm.py, schemas.py              [dùng chung]
│   └── services/
│       ├── assistants/                          [Nhật]  academic, learning, study_tools, hub
│       ├── retrieval.py, policy.py, llm.py      [Nhật]
│       ├── ingestion.py, text_cleaning.py,
│       │   page_render.py                       [Việt]
│       └── documents.py, acl.py, auth.py, audit.py, conversations.py,
│           course_quiz.py, usage.py, retention.py, plan_calendar.py,
│           storage.py, errors.py                [Hùng]
├── data_pipeline/               # MỚI (cần chốt) — OCR, chunking, xuất artifacts   [Việt]
│   ├── README.md                #   cách chạy, hợp đồng chunk
│   ├── ocr.py, chunking.py, page_map.py, export.py
│   └── quality.py               #   kiểm tra page_map, chân trang, kích thước chunk
├── data/                        # KHÔNG commit (BR-12): app.db, artifacts/, uat_runs/
├── scripts/                     # seed / import: Việt (dữ liệu), Hùng (người dùng, môn); log_*.py: không sửa
├── eval/                        # benchmark, ragas, router, uat, results   [Nhật]
├── tests/                       # test_api/, test_services/ theo chủ module; conftest.py [dùng chung]
├── frontend/                    # Next.js                                  [Bình]
│   └── src/app, src/components, src/lib, src/types
├── migrations/                  # MỚI khi có Alembic (H-5)                   [Hùng]
├── docs/
│   ├── README.md                # mục lục tài liệu
│   ├── documentions/            # PRD, backlog, mô tả, phân công          [Nhật giữ]
│   ├── decisions/               # decision log (dải số riêng), câu hỏi mở [dùng chung]
│   ├── handover/                # hướng dẫn chạy (mỗi người một mục), vận hành
│   ├── uat/                     # kịch bản và báo cáo UAT                  [Nhật]
│   ├── archive/                 # báo cáo cũ, chỉ đọc
│   ├── guide/                   # Technical Book của template — KHÔNG sửa
│   └── work/, plans/, rules/    # cục bộ, gitignore — KHÔNG push
└── README.md, ARCHITECTURE.md, .github/   # file gốc template — giữ nguyên
```

---

## 6. Quy trình Git

- **Nhánh cá nhân** theo backlog: `feat/BL-xx-<mô-tả>`, `fix/BL-xx-<mô-tả>`. Mỗi việc trong §1 một nhánh, một PR, nhỏ và review được.
- **Nhánh tích hợp:** hiện là `ndmnhat`; đề xuất đổi thành `develop` theo `.github/BRANCHING.md` (*cần chốt*). `main` chỉ nhận bản ổn định.
- Lịch sử `ndmnhat` đã được viết lại ngày 2026-10-03 (gỡ `docs/work`). Ai đã có nhánh cũ thì tạo lại nhánh từ `ndmnhat` mới, hoặc cherry-pick commit của mình. **Không merge** `binh` / `quanghung` cũ vào.
- Commit theo Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), ghi mã BL/FR/BR liên quan.
- Không `git add .`, không force push lên nhánh dùng chung, không bỏ qua hook (`--no-verify`).
- PR chạm file của người khác hoặc file dùng chung: gắn chủ file làm reviewer.
- Không commit `.env`, `data/`, holdout, đáp án tham chiếu (BR-12).

---

## 7. Thứ tự đề xuất

1. **Tuần đầu (P1):**
   - chốt các mục "cần chốt" ở §3–§6;
   - H-1, H-2 + B-2, H-6, H-8;
   - N-1, N-3, N-4, N-6, N-8 + B-3;
   - V-3, V-7.
2. **Tiếp theo:** H-3 + B-1 (stream); V-1, V-2 → N-5 (chunk mới, rerank); N-2.
3. **Sau cùng (P2–P3):** H-4, H-5, H-9, N-7 + B-4, V-4, V-5, V-6, H-7 + B-5, B-6.
