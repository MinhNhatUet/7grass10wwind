# 80 — Review dự án EDU-04 từ góc nhìn full-stack AI giáo dục

## Yêu cầu và phạm vi

Người dùng yêu cầu nhận xét thẳng thắn project hiện tại và hướng giải quyết các chức năng chưa hoàn thiện. Chỉ review, không sửa code sản phẩm, không commit/push. Không đọc secret, không gọi LLM/embedding thật, không thao tác DB sản phẩm. File này là nhật ký và báo cáo của lượt review.

File quy tắc ban đầu `docs/rules/coding_agent_rules.md` không tồn tại. Sau khi người dùng bổ sung, tìm thấy và đọc `docs/coding_agent_rules.md`. Nội dung là quy tắc chung về code, bảo mật và kiểm thử; không phải bộ R-01…R-12 được CLAUDE.md mô tả. Không tự tạo/thay thế tài liệu quy tắc. `docs/plans/` cũng không tồn tại; không triển khai hạng mục TV1.

## Bước 1 — Đọc hiện trạng và tài liệu

- Đọc README, PRD MVP v2, phần nghiệp vụ/BR của PRD gốc, bảng backlog, báo cáo eval và release gate.
- Đọc các đường đi chính: auth/ACL, retrieval, router, Academic/Learning, citation, conversations, study plan, đề giảng viên, ingestion/index/withdraw, API và schema ORM.
- Đọc code frontend chat, các thao tác learning, logout và workflow CI.
- Skill UI/UX được đọc để định hướng kiểm tra tương tác. Công cụ tra cứu local báo thiếu `data/ux-guidelines.csv`; không dùng kết quả không tồn tại làm bằng chứng. Không thực hiện audit hình ảnh/browser/accessibility đầy đủ.
- Nhận xét: có kiến trúc sản phẩm thực, không còn chỉ là skeleton. Phạm vi MVP đã rộng; phần kiểm chứng học thuật và bảo vệ các luồng đồng thời chưa theo kịp.

## Bước 2 — Kiểm tra tự động hiện có

| Lệnh | Kết quả |
|---|---|
| `APP_ENV=test OPENAI_API_KEY=test-key pytest tests/ -q --tb=short` | 24 passed |
| `ruff check src/ tests/` | All checks passed |
| `cd frontend && npm run lint` | 0 lỗi, 17 cảnh báo |
| `npx tsc --noEmit --incremental false` trước build | Lỗi route cũ trong `.next/types/validator.ts` |
| `npm run build` | Thành công; compile, TypeScript và sinh route hoàn tất |
| `npx tsc --noEmit --incremental false` sau build | Thành công |

Lưu ý: cache route cũ là vấn đề artifact local, không kết luận source TypeScript hỏng. CI hiện đã có frontend lint/build, khác với một số mô tả trong PRD MVP. Các test không gọi provider thật. Không chạy browser UAT, load test, coverage hoặc holdout trong lượt này.

## Bước 3 — Tái hiện trên SQLite in-memory, mock provider

Dùng fixture `tests/test_document_workflows.py::setup.__wrapped__()`, mock embedding và dữ liệu giả. Không ghi file test mới. Lần đầu script dừng vì dùng sai thuộc tính `AppError.status_code`; sửa script inline và chạy lại, thu được các kết quả sau.

### F-01 — Job index phát hành lại version đã bị thu hồi trong lúc embedding

- Vị trí: `src/services/documents.py::_run_index`, `withdraw`.
- BL-13/14; FR-08; BR-01/07.
- Tái hiện: version Approved, có approval đúng revision, chunk chưa embedding. Trong callback embedding mock, reviewer gọi `withdraw`. Trạng thái ngay lúc đó là Withdrawn. Sau khi `_run_index` chạy tiếp và commit: trạng thái Published, `still_servable=True`.
- Cơ chế: job kiểm tra approval/revision nhưng không chặn trạng thái đã thu hồi khi phát hành; withdraw không tăng revision. Ngay cả trạng thái Withdrawn trên cùng ORM object vẫn bị gán lại Published.
- Ưu tiên: P0 trong phạm vi review — chặn trước pilot.
- Hướng sửa: chuyển trạng thái bằng compare-and-swap trong DB theo state/revision; refresh và kiểm tra lại ngay trước publish; withdraw tăng generation/revision, hủy job; worker phải có quyền sở hữu job và không được tự vượt qua trạng thái thu hồi. Test với hai DB session và barrier mô phỏng đồng thời.

### F-02 — Lộ trình và lịch xuất vẫn chứa nội dung từ nguồn bị thu hồi

- Vị trí: `src/services/conversations.py::plan_view`, `src/api/conversations.py::plan_calendar`, `src/services/plan_calendar.py::plan_ics`.
- BL-14/23/26; FR-03.9, FR-05.4; BR-03/10.
- Tái hiện: plan có session gắn citation của version. Thu hồi version. `plan_view` trả `needs_update=True` nhưng objective vẫn là `PRIVATE SOURCE CONTENT`. `plan_ics` vẫn chứa chuỗi đó.
- Cơ chế: cảnh báo thay đổi quyền không tương đương che dữ liệu; export dùng dữ liệu plan gốc. Endpoint danh sách plan/self-check cũng đọc metadata trực tiếp, cần rà soát thêm.
- Ưu tiên: P0 trong phạm vi review.
- Hướng sửa: một serializer an toàn dùng chung cho detail, list, chat và export; che các trường dẫn xuất của session mất nguồn, hoặc chặn cả plan nếu không tách an toàn; export chỉ dùng dữ liệu đã authorize. Test revoke, khóa tài khoản, hết quyền, xóa citation/message và export.

### F-03 — Citation validator bỏ nhãn nhưng giữ nguyên khẳng định không hợp lệ

- Vị trí: `src/services/assistants/__init__.py::validate_citations`, `src/services/assistants/academic.py::answer`.
- BL-18/21; FR-02/10; BR-04/05/10.
- Tái hiện đầu vào: `Valid claim [1]. Secret revoked claim [2]. Fabricated claim [99]. No citation claim.` Nguồn 2 Withdrawn.
- Đầu ra: `Valid claim [1]. Secret revoked claim . Fabricated claim . No citation claim.` Còn một nguồn hợp lệ nên `used` không rỗng; Academic không chặn toàn câu trả lời chỉ vì các ý còn lại mất nguồn.
- Cơ chế: xác minh ID/quyền của citation, chưa xác minh nguồn hỗ trợ ý hoặc độ bao phủ từng khẳng định. Quote khớp nguyên văn chỉ chứng minh quote có trong chunk, không chứng minh claim đúng.
- Ưu tiên: P0 nếu nội dung nguồn thu hồi còn lọt; P1 cho correctness/coverage.
- Hướng sửa: structured output gồm từng claim, source refs và đoạn chứng minh; loại cả claim khi nguồn không hợp lệ, không chỉ xóa marker. Thêm kiểm tra entailment/groundedness và đánh giá thủ công với GV. Không dựa vào cosine như xác suất đúng.

### F-04 — Khóa tài khoản giữa request chưa được kiểm tra bằng trạng thái User mới

- Vị trí: `src/services/retrieval.py::still_servable`, `src/services/acl.py`, `src/services/conversations.py::send`.
- BL-05/06/14; FR-01 AC-01.4; BR-03.
- Tái hiện: một DB session khác đổi user.status sang locked và commit. User object của request vẫn `active`; `still_servable` trả True.
- Cơ chế: refresh version và document nhưng không refresh User; identity map có thể giữ Membership cũ. Chưa tái hiện riêng thay Membership đồng thời trong lượt này.
- Ưu tiên: P1, sửa trước pilot.
- Hướng sửa: đọc principal và quyền hiện hành bằng truy vấn mới trước LLM và trước trả kết quả; kiểm tra hiệu lực phiên khi cần; authorization revision. Test khóa/đổi role/quyền giữa retrieval và generation.

### F-05 — Chẩn đoán kiến thức không lưu/chấm được

- Vị trí: `src/services/assistants/study_tools.py::diagnose`, `src/services/conversations.py::save_quiz_answers` dòng 538; frontend `learning-cards.tsx`.
- BL-22; FR-03.2–03.4.
- Tái hiện: message có kind diagnose, gọi save_quiz_answers → NOT_FOUND. Frontend render quiz và diagnose bằng cùng thẻ và gọi cùng API.
- Cơ chế: handler chỉ chấp nhận kind quiz.
- Ưu tiên: P1 chức năng.
- Hướng sửa: dùng hợp đồng self-check chung cho quiz/diagnose hoặc tách endpoint rõ ràng, kiểm tra owner/nguồn như nhau. Test tạo → lưu tạm → mở lại → chấm diagnose.

## Bước 4 — Các thiếu sót qua đọc code và tài liệu

### Learning chưa thể coi là cá nhân hóa hoàn chỉnh

- `learning.plan` không nhận kết quả assessment; `_learning_action` không truyền assessment vào bước tạo plan. Có công cụ diagnose và plan nhưng chưa thấy chuỗi bắt buộc kết nối kết quả chẩn đoán → ưu tiên kiến thức yếu → điều chỉnh lịch.
- Bản điều chỉnh chỉ truyền mục tiêu plan trước vào prompt, không truyền các session đã hoàn thành để đảm bảo giữ tiến độ bằng code.
- `update_plan` sửa bản Confirmed/InProgress tại chỗ; không tạo version và không kiểm tra tổng phút mỗi ngày với minutes_per_day. `sources` cũ được giữ dù nội dung session đã sửa, có thể làm citation không còn phù hợp.
- BL-22/23, FR-03.4–03.12. Hướng sửa: lưu assessment theo topic/objective, nối với plan; đảm bảo thời lượng bằng validator chung; bản sửa là Draft mới, giữ completed sessions bằng code; citation phải rà lại khi sửa nội dung.

### Đề thi hiện phù hợp tự luyện hơn thi chính thức

- `course_quiz.submit` nhận bài muộn không giới hạn, vẫn chấm và chỉ đánh dấu late. Đây là hành vi được PRD MVP mô tả, không gọi là bug nếu đã được nghiệp vụ chấp thuận; không đủ bảo vệ kỳ thi tính điểm.
- `start` query rồi insert, schema QuizAttempt không có unique/lock đảm bảo một attempt khi hai request cùng chạy.
- Đáp án của đề kiểm tra không gửi cho sinh viên: đây là điểm tốt.
- Tạo đề PDF giữ bản nháp trước phát hành: điểm tốt. Chưa lưu provenance theo trang/quote cho từng câu; kiểm tra 4 options/đáp án không chứng minh đúng học thuật. PDF bị cắt ở MAX_PDF_CHARS cần thông báo rõ phạm vi.
- Hướng sửa: chốt deadline policy, auto-submit hoặc từ chối đáp án sau hạn, lưu dần đáp án; atomic attempt creation/submission; câu hỏi/đề immutable có version, lưu nguồn và bắt buộc GV duyệt các câu AI.

### Session/logout và vận hành

- SessionStore và login rate limiter nằm trong bộ nhớ: restart mất phiên, multi-worker không chia sẻ phiên/giới hạn.
- Nút logout ở main-shell/admin-shell chỉ xóa localStorage, không gọi API logout; token server chưa bị thu hồi cho tới expiry.
- Token localStorage tăng hậu quả nếu có XSS; không có bằng chứng XSS trong lượt review.
- Hướng sửa: session DB/Redis, logout server, cookie HttpOnly/Secure qua BFF hoặc chiến lược token phù hợp. Nếu dùng cookie phải thiết kế CSRF/CORS.
- Jobs daemon thread không giới hạn, resume queued/running không có lease; mỗi worker startup có thể chạy cùng job. Cần queue bền vững, job claim/lease, idempotency, concurrency limit.
- Không bắt buộc thay SQLite/NumPy chỉ vì là MVP. Khi scale, ưu tiên DB migration/backups, kiểm chứng PostgreSQL rồi mới pgvector theo số liệu tải.

### Quota/chi phí

- `_check_quota` chỉ đếm UsageEvent và chạy trước ghi user message, chưa có reservation atomic cho request đồng thời. NON_CHAT loại quiz_generate/quiz_assess khỏi quota; chưa thấy budget gate tương ứng cho các lượt này.
- `usage` có token/chi phí là điểm tốt; bảng giá global, chưa lưu model/provider/pricing version, actual vs estimated; embedding chưa có trong chi phí.
- Hướng sửa: kiểm soát budget dùng chung cho các loại AI call, reserve/release atomic, hạn mức user/course/day/month và concurrency; usage có model/provider/measurement_source/pricing_version/embedding_cost.

### Chat/frontend

- Chat load messages một lần, không xử lý next_cursor; API mặc định 30 và sắp từ cũ đến mới nên hội thoại dài có thể chỉ hiện phần đầu.
- Chat POST không gửi Idempotency-Key; backend có idempotency nhưng frontend chưa tận dụng khi retry/lỗi mạng.
- Lỗi load history/feedback có nhánh chỉ console.error hoặc không kiểm tra HTTP response, cần thông báo và retry thực sự.
- Nếu stream, không stream thẳng nội dung học thuật chưa xác minh: stream tiến độ trước, hoặc buffer/authorize từng đơn vị nội dung; thu hồi giữa luồng phải dừng.
- Hướng sửa: latest-first/cursor lịch sử, pagination UI, request UUID ổn định, error state thay vì assistant answer giả, tránh response cũ đi vào conversation mới khi điều hướng giữa request.

### Guardrails và RAG

- Retrieval lọc tập nguồn theo ACL trước tính similarity: đúng hướng, cần giữ nguyên khi nâng retrieval.
- Retrieval có cosine + keyword bonus tối giản; PRD MVP mô tả chưa có hybrid cần cập nhật. Chưa có BM25/reranker chuẩn.
- Guardrail liêm chính là regex trên câu hiện tại và prompt, chưa đủ chứng minh chống yêu cầu vòng vo hoặc nhiều lượt góp thành lời giải. Không kết luận mọi injection đã được chặn chỉ vì có BASE_POLICY.
- Hướng sửa: safety suite có tiếng Việt không dấu, đa lượt, yêu cầu gián tiếp, nguồn chèn lệnh; phân biệt bài tự học/thi/bài nộp bằng metadata và state. Giữ authorization bằng code, không để LLM cấp quyền.
- RAG: đo baseline trước; chunk theo trang/mục với mapping gốc và parent context; đo recall@k, citation precision, coverage, abstention; thử BM25+vector/RRF/rerank theo benchmark, không thay kiến trúc vì xu hướng.

## Bước 5 — Bằng chứng sản phẩm và thứ tự xử lý

- `eval/results/report.md` ghi accuracy chưa đo, UAT 16 Pass/22 Blocked, chưa có khảo sát người dùng. Số liệu latency p50 5,7s, p95 15,1s là báo cáo cũ n=10, không phải lượt đo mới này.
- README còn template; release_gate và PRD MVP có mô tả chưa khớp code/report hiện tại. Không lấy tài liệu tự khai làm bằng chứng chức năng đã nghiệm thu.
- Đề xuất: không thêm tính năng mới cho tới khi sửa các lỗi nguồn/quyền và nối hoàn chỉnh Learning.
- Đợt A: F-01…F-05, logout server, regression hai session và API.
- Đợt B: holdout 100 mẫu do GV duyệt, safety riêng, UAT browser bốn vai trò; báo kết quả thật theo nhóm, không tinh chỉnh trên holdout.
- Đợt C: plan có version/budget/assessment, pagination/retry, session bền vững, budget gate/worker queue; sau đó pilot nhỏ với người thật và đo mức học được/tiết kiệm thời gian.
- Chỉ nâng multi-course/OCR/calendar hai chiều sau khi có baseline và luồng lõi đáng tin.

## Kết luận

EDU-04 là MVP nghiêm túc, có cấu trúc tốt và workflow học liệu/giảng viên tạo khác biệt so với chatbot PDF. Chưa đủ điều kiện vận hành với học liệu hạn chế hoặc thi chính thức vì các lỗi thu hồi/quyền/citation đã tái hiện và chưa có bằng chứng accuracy. Giải pháp không phải viết lại toàn bộ, mà là vá các invariant server-side, test các luồng đồng thời, hoàn thiện vòng học có assessment và đo chất lượng bằng người chuyên môn.
