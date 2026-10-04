# UC-11 — MVP toàn sản phẩm (làm thay phần của TV2, TV3, TV4)

| Thuộc tính | Nội dung |
|---|---|
| Yêu cầu | Người dùng ngày 25/09/2026: "làm một MVP hoàn chỉnh là làm hết của mọi người luôn" |
| Phạm vi | Bản **tối giản** các Must: BL-04…BL-24, BL-25/26 (tối thiểu), BL-35; UI-01…UI-10 |
| Quyết định | D-20 SQLite + SQLAlchemy · D-21 embedding lưu trong SQLite, tìm bằng numpy sau khi lọc quyền · D-22 pypdf + python-pptx · D-23 python-multipart (bắt buộc cho upload của FastAPI) · D-27 router điều phối theo prompt bằng LangGraph (thay D-24 sai) |
| Owner gốc | TV2 (backend/ACL/audit), TV3 (ingestion/RAG/guardrails), TV4 (frontend) — **cần báo cả nhóm** |

## 1. Luồng chính (PRD 6)

1. GV phụ trách môn **upload** PDF/PPTX (FR-06) → `Processing` → parse, chia trang/slide thành chunk → `Draft`, hoặc `NeedsReview` nếu có trang rỗng hoặc không có text.
2. GV xem **preview** text từng trang → **gửi duyệt** → `PendingApproval`.
3. **Người duyệt khác người tải** (BR-11, UAT-09) duyệt kèm `reviewed_revision` → `Approved` → `Indexing` (embedding Gemini) → `Published`. Từ chối thì bắt buộc có lý do → `Rejected`.
4. SV/GV hỏi trong **UI-03**: Academic (hỏi đáp có citation), Learning (giải thích, tự kiểm tra, lộ trình), Hub (tìm tài liệu). Retrieval **lọc quyền trước** rồi mới tính similarity (BR-03). Citation lấy từ ID nội bộ (PRD 10.4). Trước khi trả kết quả phải kiểm tra lại quyền và trạng thái nguồn.
5. **Thu hồi** → `Withdrawn`, chặn phục vụ ngay: retrieval và mở nguồn đều kiểm tra trạng thái tại thời điểm gọi. Message cũ trỏ tới nguồn đã thu hồi bị che khi đọc lại (FR-05.4).
6. Feedback (FR-05.5/05.6), Dashboard GV (FR-12), Quản trị cấp quyền (FR-01.4). Mọi quyết định đều ghi audit (BR-11).

## 1b. Điều phối (FR-11 Must; PRD 10.1, 10.3; D-27, D-28) — `src/agents/orchestrator.py`

```text
START → policy ─┬─ redirect (xin đáp án bài tính điểm, BR-06) ───────────────────────────→ END
                └─ allow → router (LLM: chọn MÔN trong danh sách được phép + trợ lý) ─┬─ academic → END
                                                                                      ├─ learning (explain | analogy | quiz | diagnose | flashcards | cloze | triage | plan) → END
                                                                                      ├─ hub → END
                                                                                      └─ clarify (hỏi làm rõ, kể cả chưa rõ môn) → END
```

- **Không có bước chọn môn và chip trợ lý trên UI (D-28).** Backend đưa cho router danh sách môn user được đọc (BR-02). Router chỉ chọn trong danh sách đó; chỉ một môn thì dùng luôn; câu nối tiếp giữ môn lượt trước; không rõ môn → clarify, không truy xuất.
- Hội thoại không cố định môn (`conversations.course_id` nullable, có migration SQLite trong `src/db.py`); môn đã chọn lưu ở `metadata.route.course_id` của câu trả lời, dùng cho kế hoạch, feedback, thống kê.
- API vẫn nhận `course_id` (cố định môn) và `assistant` (ép trợ lý) để tương thích runner eval; UI không dùng.
- Router chỉ phân loại, không trả lời; rút days/minutes_per_day chỉ khi người dùng nói rõ, thiếu → Learning hỏi lại (AC-03.1). `recursion_limit` = 8 (FR-11.6). Trace ở `metadata.route`, UI hiện "Router: <trợ lý> · <môn>".

## 1c. Công cụ học chủ động (D-30, mở rộng FR-03) — `src/services/assistants/study_tools.py`

| `learning_action` | Hàm | Ràng buộc |
|---|---|---|
| `diagnose` | `diagnose()` | 3 câu tình huống; chấm qua `POST /learning/quizzes/{id}/answers`; chủ đề có lỗ hổng → `review_pages`/`review_citations` từ nguồn đã trích |
| `flashcards`, `cloze` | `flashcards(mode)` | mỗi thẻ có `sources`; đáp án cloze phải nằm nguyên văn trong chunk được trích, sai → loại |
| `analogy` | `analogy()` | bước 1 `academic.answer` chỉ hỏi khái niệm; bước 2 LLM riêng diễn lại, không [n], gắn dưới tiêu đề "ẩn dụ minh họa, KHÔNG phải nội dung nguồn" + "Lưu ý" chỗ không khớp; không có nguồn → không dựng ẩn dụ |
| `triage` | `triage()` | truy xuất nhiều truy vấn (`TRIAGE_PROBES`); định nghĩa ≤ 8, sai lầm ≤ 5 (chỉ từ tài liệu), ví dụ 2; thiếu → `notes` |

- Router trả `topic` (với analogy: chỉ khái niệm), `analogy_context`, `search_terms`; `_retrieval_query()` ghép thuật ngữ còn thiếu vào câu truy xuất (Q-17).
- UI: `QuickActions` (gửi thẳng / điền sẵn câu mẫu — router vẫn quyết định), `FlashcardDeck`, `ClozeCard`, `TriageCard` trong `frontend/src/components/StudyTools.tsx`.

## 2. Phân quyền (PRD 5.1) — `src/services/acl.py`

| Quyền | Sinh viên | Giảng viên | GV duyệt | Quản trị |
|---|---|---|---|---|
| Đọc/hỏi | môn có membership | mọi môn | mọi môn | không (trừ khi được cấp nội dung) |
| Tải bản gốc | membership + cờ `download_allowed` | mọi môn | mọi môn | không |
| Upload/sửa nháp/gửi duyệt | ✗ | môn có membership `upload` | môn có `upload` | ✗ |
| Duyệt/từ chối | ✗ | ✗ | môn có `review`, khác uploader | ✗ |
| Thu hồi | ✗ | ✗ (MVP chưa có luồng "đề nghị") | môn có `review` | khóa khẩn cấp (lock document) |
| Cấp tài khoản/môn | ✗ | ✗ | ✗ | ✓ + audit |

- Tài liệu gắn nhãn `answer`/`exercise_graded` (IntegrityLabel) không bao giờ được phục vụ cho SV (BR-06).
- Chỉ phục vụ version `Published` và vai trò nằm trong `acl_roles` (BR-01). Trường hợp chưa rõ thì từ chối.

## 3. Cấu trúc thư mục

```text
src/
├── db.py                       engine SQLite, SessionLocal, Base, init_db()
├── models/
│   ├── schemas.py              + schema API
│   └── orm.py                  🆕 User, Course, Membership, Document, DocumentVersion, Chunk, IngestionJob,
│                                  Approval, AuditEvent, Conversation, Message, Citation, Feedback,
│                                  StudyPlan, IdempotencyRecord, UsageEvent
├── services/
│   ├── auth.py                 chuyển UserStore sang DB
│   ├── acl.py                  🆕 quyền theo 5.1
│   ├── audit.py                🆕 ghi AuditEvent
│   ├── storage.py              🆕 lưu file riêng tư data/storage/<sha256>
│   ├── ingestion.py            🆕 kiểm tra loại file (magic bytes), parse pypdf/python-pptx, chunk, job nền
│   ├── text_cleaning.py        🆕 làm sạch text theo trang trước khi chunk (D-29)
│   ├── documents.py            🆕 vòng đời: upload, submit, decision, index, withdraw, revision/conflict
│   ├── retrieval.py            🆕 lọc quyền (SQL) → cosine numpy → top-k
│   ├── policy.py               🆕 kiểm tra liêm chính (BR-06), input size, quota
│   ├── assistants/                (dịch vụ; được gọi từ node của graph điều phối)
│   │   ├── academic.py         🆕 evidence gate → generation JSON → validate citation → re-auth
│   │   ├── learning.py         🆕 giải thích, tự kiểm tra, lộ trình (kiểm tra quỹ thời gian bằng code)
│   │   └── hub.py              🆕 tìm tài liệu
│   ├── conversations.py        🆕 tạo/đọc/xóa, idempotency, che nguồn đã thu hồi
│   └── dashboard.py            🆕 thống kê, feedback workflow
├── api/
│   ├── auth.py  documents.py  review.py  conversations.py  citations.py  feedback.py  dashboard.py  admin.py
└── main.py
scripts/seed_users.py           → seed DB: môn (manifest), user, membership (fixtures + .env)
scripts/import_books.py         🆕 đưa sách dev qua đúng luồng upload → duyệt → publish (tài khoản GV + reviewer)
scripts/reprocess_books.py      🆕 xử lý lại bản Published bằng pipeline mới → version mới, đủ HITL (D-29)
frontend/src/app/
├── chat/page.tsx               UI-03 + UI-06 (panel nguồn)
├── library/page.tsx            🆕 Thư viện môn học cho SV/GV: danh sách tài liệu đã phát hành + trình đọc (FR-04, thay khối "Tài liệu gần đây" của UI-02 đã bỏ theo D-28)
├── lecturer/documents/page.tsx UI-07
├── lecturer/review/page.tsx    UI-08
├── lecturer/dashboard/page.tsx UI-09
└── admin/page.tsx              UI-10
```

## 4. API (PRD 11.2)

Theo đúng bảng PRD 11.2: `/me`, `/me/courses`, `/conversations` (CRUD + messages), `/documents` (Hub list), `/citations/{id}/source`, `/documents/{id}/versions/{vid}/download`, `POST /documents`, `POST /documents/{id}/versions`, `/jobs/{id}`, `/review/versions/{vid}/preview`, `/versions/{vid}/submit|decision|withdraw`, `/answers/{id}/feedback`, `/metrics`.
Bổ sung ngoài bảng: `/dashboard/*`, `/admin/*`, `/learning/plans/*`, `DELETE /conversations` (xóa toàn bộ lịch sử của chính user, xóa mềm như FR-05.7). Các endpoint này ghi rõ trong code là bổ sung.

Response hội thoại theo PRD 11.3. Lỗi theo PRD 11.4. Mọi request thay đổi dữ liệu nhận `Idempotency-Key`.

## 5. Giới hạn MVP (ghi rõ, không che)

- Không OCR (Should BL-33). PDF scan → `NeedsReview` kèm cảnh báo trang không có text.
- Router: một yêu cầu đi một trợ lý; chưa chia yêu cầu nhiều ý thành nhiều bước phụ thuộc (FR-11.3).
- Chưa có cache câu trả lời (NFR-11: defer).
- Tính năng retention chỉ có xóa mềm hội thoại. Quota là giới hạn số câu hỏi/ngày theo cấu hình.
- Chưa có Docker cho frontend (BL-29); chạy theo `docs/handover/huong_dan_chay.md`.

## 6. Kiểm tra (MVP, không viết test mới)

ruff, typecheck/build frontend. Chạy thật: import 1–2 sách → hỏi Academic → citation mở đúng trang → thu hồi → nguồn biến mất. Chạy lại `pytest tests/` có sẵn.
