# PRD v2 — EDU-04 "Kho tri thức hỗ trợ học thuật X" (bản MVP)

| Mục | Nội dung |
|---|---|
| Phiên bản | 2.1 — mô tả bản MVP đã xây dựng (2.0: 2026-10-02; 2.1: cập nhật D-63 → D-74 và kết quả UAT) |
| Ngày | 2026-10-03 |
| Nhánh | `ndmnhat` |
| Nhóm | "7 cỏ 10 gió" (AI20K Build Phase) |
| Tài liệu gốc | `PRD_edu04.md` (v1). PRD v2 **không thay thế** v1: v1 là yêu cầu đích, v2 ghi lại phạm vi MVP thực tế, các điểm lệch có chủ đích (D-xx trong `docs/decisions/decision_log.md`) và lộ trình cải tiến |

> Quy ước: **[Đã có]** = đã chạy trong mã nguồn; **[Một phần]** = có nhưng chưa đủ yêu cầu v1; **[Chưa có]** = chưa làm. ID FR/BR/BL theo PRD v1 và backlog.

---

## 1. Tóm tắt

EDU-04 là trợ lý học thuật dùng RAG trên kho tài liệu môn học. MVP phục vụ **một môn demo là SE101 Công nghệ phần mềm**, gồm 15 bộ slide/giáo trình PDF, chia thành 76 đoạn lấy từ pipeline MinerU (`data/artifacts`). Sản phẩm có ba vai trò sử dụng hằng ngày, mỗi vai trò có không gian riêng:

| Vai trò | Không gian | Giá trị chính |
|---|---|---|
| Sinh viên | Hỏi đáp · Tài liệu học tập · Ôn tập & đề kiểm tra · Lộ trình học | Hỏi đáp có trích dẫn đúng trang; tự ôn bằng trắc nghiệm, flashcard, điền khuyết, tự luận; lộ trình học theo ngày |
| Giảng viên / Người duyệt | Hỏi đáp · Quản lý (Duyệt) tài liệu · Câu hỏi trắc nghiệm | Tải và quản lý tài liệu theo luồng duyệt; soạn đề, **tạo đề từ PDF bằng AI**, phát hành và xem kết quả |
| Quản trị viên | Quản lý tài liệu · Giám sát · Cấu hình · Hệ thống | Khóa khẩn cấp tài liệu, giám sát vận hành, **chi phí AI**, người dùng, môn học, nhật ký. Không dùng Hỏi đáp và không đọc nội dung học tập |

Nguyên tắc xuyên suốt, kế thừa từ v1:
- Mọi khẳng định học thuật có trích dẫn (BR-04).
- Lọc quyền trước khi truy xuất (BR-03).
- Tài liệu được coi là dữ liệu, không phải chỉ thị (BR-09).
- Không đưa lời giải bài tập (BR-06).

Tất cả các quy tắc này được thực thi ở server.

---

## 2. Mục tiêu MVP và phạm vi

### 2.1 Mục tiêu
1. Chứng minh chuỗi RAG có trích dẫn **mở đúng trang nguồn** trên dữ liệu thật của một môn.
2. Chứng minh luồng tài liệu có con người duyệt (HITL): tải lên → duyệt → phát hành → thu hồi.
3. Biến tài liệu thành hoạt động học chủ động (ôn tập, lộ trình) và công cụ soạn đề cho giảng viên.
4. Vận hành được: phân quyền theo vai trò, audit, theo dõi chi phí AI.

### 2.2 Phạm vi so với PRD v1

| Nhóm chức năng (v1) | Trạng thái MVP | Ghi chú |
|---|---|---|
| Academic Assistant — hỏi đáp có trích dẫn (FR-02, FR-10) | **[Đã có]** | Trích dẫn [n] ngay trong câu trả lời; rê chuột hiện đoạn trích riêng của câu đó; bấm mở đúng trang hoặc khoảng trang (D-49, D-50, D-55, D-56) |
| Learning Assistant — giải thích, tự kiểm tra, lộ trình (FR-03) | **[Đã có]** | Thêm trắc nghiệm A–D, flashcard, điền khuyết, "cấp cứu" sát giờ thi, chẩn đoán kiến thức nền (D-30); câu/thẻ AI soạn phải có câu trích chứng minh đáp án (D-74) |
| Knowledge Hub — tìm tài liệu (FR-04) | **[Đã có]** | Trong chat (router chọn) và trang Tài liệu học tập |
| Router chọn môn và trợ lý (FR-11) | **[Đã có]** | Người dùng không chọn môn/trợ lý; router chỉ chọn trong các môn được phép (D-27, D-28) |
| Luồng tài liệu HITL (FR-06 → FR-08) | **[Đã có]** | Phiên bản bất biến, thu hồi chặn ngay, xem trang gốc dạng ảnh render ở server |
| Quản trị người dùng, quyền, audit (FR-01) | **[Đã có]** | Khu quản trị 4 nhóm (D-61) |
| Đề trắc nghiệm của giảng viên | **[Đã có — ngoài v1]** | Quiz Builder (D-38) + tạo đề từ PDF bằng LLM (D-59) |
| Chi phí AI | **[Đã có — ngoài v1]** | Đếm token thật, ước tính chi phí theo bảng giá (D-60) |
| Đồng bộ Google Calendar 2 chiều | **[Một phần]** | Chỉ có link thêm sự kiện + file `.ics` (D-37) |
| Hạn mức theo người dùng / môn | **[Một phần]** | Có giới hạn câu hỏi/ngày ở server; trang "Cấu hình hạn mức" mới là bản xem thử |
| Nhiều môn, liên môn (BR-13) | **[Chưa có]** | Kiến trúc hỗ trợ nhiều môn nhưng dữ liệu demo chỉ SE101 |
| Đăng nhập SSO / OAuth | **[Chưa có]** | Đăng nhập tối giản bằng login_id + mật khẩu (UC-09). Nút "Đăng nhập demo" (chọn Sinh viên / Giảng viên) chỉ bật ở môi trường demo (D-71) |

---

## 3. Người dùng và quyền

| Hành động | Sinh viên | Giảng viên | Người duyệt | Admin |
|---|:-:|:-:|:-:|:-:|
| Hỏi đáp, xem nguồn | ✔ (môn được ghi danh) | ✔ | ✔ | ✘ (403, D-61) |
| Ôn tập, lộ trình học | ✔ | — | — | ✘ |
| Tải tài liệu, sửa metadata, gửi duyệt | ✘ | ✔ (môn phụ trách) | ✘ | ✘ |
| Duyệt / từ chối / thu hồi tài liệu | ✘ | ✘ | ✔ (môn được giao) | ✘ |
| Khóa khẩn cấp tài liệu | ✘ | ✘ | ✘ | ✔ |
| Soạn đề, tạo đề từ PDF, phát hành, xem kết quả | ✘ | ✔ (môn phụ trách) | ✔ | ✘ |
| Làm đề giảng viên giao | ✔ | — | — | ✘ |
| Người dùng, môn học, nhật ký, chi phí AI | ✘ | ✘ | ✘ | ✔ |

- Quyền luôn tính từ token và DB, không tin dữ liệu client gửi (BR-02).
- Đối tượng ngoài quyền trả 404 để không lộ sự tồn tại (BR-10).
- Trang hồ sơ cá nhân đã bỏ; giao diện chỉ hiện tên người dùng (D-62).

**Tài khoản demo:** `sinhvien`, `giangvien`, `quantri`; `kiemduyet01` là người duyệt phía sau. Mật khẩu chỉ nằm trong `.env`.

---

## 4. Yêu cầu chức năng của MVP

### 4.1 Hỏi đáp (Academic Assistant)
- **MVP-QA-01** Câu hỏi đi qua chuỗi: policy (chặn xin lời giải bài tập, BR-06; chặn prompt injection, BR-09) → router → truy xuất có lọc quyền → trợ lý → kiểm tra quyền lần cuối → lưu.
- **MVP-QA-02** Mỗi câu khẳng định gắn nhãn `[n]`. Server kiểm theo **từng câu** (D-73):
  - câu có số nguồn không thuộc ngữ cảnh thật, hoặc trỏ tới nguồn vừa bị thu hồi, bị **xóa cả câu** (FR-10.2, BR-10);
  - câu chưa có nhãn được nhận nhãn của câu kề trong cùng đoạn, nếu server kiểm được nội dung câu nằm trong nguồn đó;
  - câu khẳng định vẫn không có nhãn bị đánh dấu "*(chưa có trích dẫn)*", và câu trả lời chuyển sang `partial`;
  - model quên gắn nhãn nhưng có câu trích nguyên văn đúng trong nguồn thì server gắn lại nhãn (D-72).
- **MVP-QA-03** Mỗi lần `[n]` xuất hiện có **đoạn trích riêng, đủ ý** (khoảng 200–600 ký tự), tính theo chính câu chứa nó. Rê chuột lên `[n]` thì hiện đoạn trích, tên tài liệu và trang (D-55, D-56).
- **MVP-QA-04** Trang của trích dẫn tính theo `page_map` của đoạn (chunk) nên mở **đúng trang**; nếu ý trải nhiều trang thì hiện khoảng trang (vd. 4–6) (D-49, D-50).
- **MVP-QA-05** Nội dung không bao giờ viết "nguồn 1". Model được dặn trước, và server tự đổi thành tên tài liệu thật (D-58).
- **MVP-QA-06** Không đủ căn cứ (dưới ngưỡng `retrieval_min_score`) thì trả lời "chưa đủ tài liệu", không bịa (BR-05).
- **MVP-QA-07** Công thức hiển thị bằng KaTeX; ký hiệu toán bị vỡ do trích PDF được khôi phục theo ngữ cảnh (D-40).
- **MVP-QA-08** Có thể hỏi riêng về một tài liệu (hội thoại gắn `document_id`, D-33).

### 4.2 Học tập (Learning Assistant)
- **MVP-LA-01** Hình thức ôn tập: tự luận ngắn (AI đánh giá mức hiểu, không cho điểm), trắc nghiệm A–D, flashcard, điền khuyết, cấp cứu sát giờ thi, chẩn đoán.
- **MVP-LA-02** Chọn chủ đề theo **chương/bài** lấy từ mục lục PDF hoặc bìa slide, chọn được nhiều chủ đề (tối đa 5 khi ôn tập, 15 khi tạo lộ trình) (D-44).
- **MVP-LA-03** Vừa tạo bài thì **không hiện nguồn**. Sau khi trả lời, lật thẻ hoặc bấm kiểm tra mới hiện hàng "Nguồn: [n]": rê chuột xem đoạn trích, bấm mở trang. Mỗi thẻ/câu có đoạn trích và trang riêng (D-57).
- **MVP-LA-04** Lộ trình học: AI tạo theo mục tiêu, số ngày và phút/ngày, hoặc theo các ngày cụ thể chọn trên lịch. Lộ trình sửa được, xoá được, xác nhận được, có tiến độ từng buổi. Mỗi buổi có nút "Ôn tập". Xuất `.ics` hoặc link Google Calendar.
- **MVP-LA-05** Tạo bài từ trang Học tập thì chuyển ngay sang chat và hiện trạng thái đang tạo (D-45).
- **MVP-LA-06** Trắc nghiệm, flashcard, điền khuyết do AI soạn kèm `proof`: câu chép nguyên văn từ nguồn, chứng minh đáp án. Server kiểm câu này có thật trong nguồn, không có thì **loại mục**. Server cũng lọc câu trùng và chia đều đáp án đúng A–D (D-69, D-74).

### 4.3 Tài liệu (giảng viên, người duyệt, admin)
- **MVP-DOC-01** Vòng đời: Draft → NeedsReview → Approved/Indexing → Published → Archived/Revoked (Failed có thể thử lại). Mọi bước ghi audit (BR-11).
- **MVP-DOC-02** Embedding ngay khi tải lên vào chỉ mục tạm, chưa dùng cho tìm kiếm tới khi Published (D-34).
- **MVP-DOC-03** Nạp sẵn đoạn (chunk) từ pipeline ngoài (`import_prechunked`) mà không trích xuất lại, giữ `page_map` để trích dẫn đúng trang (D-47).
- **MVP-DOC-04** Người duyệt xem trước trang gốc (ảnh render ở server) và bản gốc. Admin chỉ thấy danh sách và khóa khẩn cấp, không đọc nội dung (AC-01.6).

### 4.4 Đề trắc nghiệm của giảng viên (ngoài v1)
- **MVP-QZ-01** Quiz Builder: soạn câu A–D, đáp án, giải thích; loại đề luyện tập / kiểm tra / giữa kỳ / cuối kỳ; giới hạn thời gian. Đề đi qua các trạng thái Nháp → Phát hành → Đóng (D-38).
- **MVP-QZ-02** **Tạo đề từ PDF** (D-59):
  - Giảng viên tải PDF lên, có thể là đề có sẵn (AI chép câu hỏi và đáp án) hoặc tài liệu học (AI soạn câu mới).
  - Câu hỏi được thêm vào đề Nháp, tối đa 50 câu mỗi lần và 100 câu mỗi đề.
  - File không được lưu. Nội dung PDF được bọc làm dữ liệu (BR-09). Mỗi lần tạo ghi audit.
  - Chỉ phát hành được khi mọi câu đủ 4 lựa chọn và có đáp án.
  - Đề có sẵn: chỉ giữ đáp án khi PDF thật sự có bảng/dòng đáp án. Không có thì để trống cho giảng viên chọn (D-64).
  - Tài liệu học: mỗi câu phải có câu trích nguyên văn trong PDF chứng minh đáp án, được nối vào giải thích dạng "Căn cứ trong tài liệu: …". Không kiểm được thì loại câu (D-74).
- **MVP-QZ-03** Chấm ở server theo đồng hồ server, nộp muộn bị đánh dấu. Đề kiểm tra chỉ trả điểm, không lộ đáp án (BR-06).

### 4.5 Quản trị
- **MVP-ADM-01** Người dùng (tạo, khóa/mở có lý do), quyền theo môn (đọc / tải / tải lên / duyệt, hạn hiệu lực), môn học, nhật ký hoạt động.
- **MVP-ADM-02** Giám sát vận hành (số liệu sử dụng, trạng thái, độ trễ). Log JSON có `request_id`; mọi response có header `X-Request-ID`; lỗi từ 500 trở lên hiện mã hỗ trợ cho người dùng (D-65).
- **MVP-ADM-03** **Chi phí AI** (D-60):
  - Ghi token vào/ra của mọi lần gọi LLM (chat, chấm tự luận, tạo đề) theo usage provider trả về; provider không trả thì **ước lượng** ~4 ký tự/token (chưa tách nguồn đo — logging đợt 2).
  - Chi phí = token × bảng giá trong `.env`.
  - Báo cáo theo ngày, theo chức năng, theo môn, top người dùng; hiển thị bằng VND và USD.

---

## 5. Kiến trúc MVP

```
Next.js 16 (frontend/)  ──Bearer token──▶  FastAPI (src/, /api/v1)
  (main)/ khung chung: chat, library,          ├─ agents/  LangGraph: policy → router → academic | learning | hub
          learning, hub, dashboard             ├─ services/ acl · retrieval · assistants · conversations · documents
  admin/  khu quản trị riêng                   │            course_quiz · usage · page_render · audit · llm (get_llm)
  login/                                       └─ models/  SQLAlchemy → SQLite data/app.db
                                                     │
                       LLM OpenAI-compatible (vilao, gpt-4o-mini) · Embedding Gemini 768 chiều
```

| Thành phần | Lựa chọn MVP | Lý do |
|---|---|---|
| Kho vector | Embedding lưu trong SQLite, cosine bằng NumPy sau khi lọc quyền bằng SQL, cộng điểm nhỏ (≤ 0,1) cho từ khóa hiếm trùng câu hỏi (D-68) | Quy mô 1 môn (~100 đoạn) không cần vector DB; lọc quyền trước là bắt buộc (BR-03) |
| Đơn vị chunk | Chunk từ pipeline MinerU (~2.000 ký tự, có thể nhiều trang) + `page_map` | Không phải embedding lại từ PDF (tiết kiệm quota và thời gian) |
| LLM | Chỉ gọi qua `get_llm()` / `call_json` (thử lại 1 lần khi JSON lỗi) | Một điểm kiểm soát chi phí, đếm token, xử lý lỗi |
| Trích dẫn | Đoạn trích và trang tính bằng heuristic cặp âm tiết + độ hiếm (D-66, D-70). Nhãn kiểm theo từng câu (D-73), câu hỏi AI soạn kiểm `proof` (D-74). Không gọi thêm LLM | Không tốn thêm token; có thể kiểm chứng. Chưa phải kiểm chứng ngữ nghĩa |

---

## 6. Yêu cầu phi chức năng — hiện trạng

| Nhóm | Hiện trạng MVP |
|---|---|
| Bảo mật | Token phiên phía server; ACL ở mọi endpoint; 404 cho đối tượng ngoài quyền; không commit `.env` / `data/`; audit append-only (BR-11) |
| Chất lượng mã | Backend: `ruff check` + `ruff format --check` sạch, `pytest` 24 test pass (bỏ 4 test của code mẫu, thêm 1 test xác nhận đã gỡ). Frontend: `npm run build` thành công, `tsc` 0 lỗi, `npm run lint` 0 lỗi / 17 cảnh báo. CI chạy ruff + pytest (backend) và `npm run lint` + `npm run build` (frontend) |
| Quan sát | Log JSON ra stdout, có `request_id`, che khóa bí mật; header `X-Request-ID`; ghi token và chi phí của mỗi lượt gọi LLM (D-60, D-65) |
| Phiên đăng nhập | Lưu trong bộ nhớ tiến trình backend (`SessionStore`): restart là mất phiên, không chia sẻ giữa nhiều worker |
| Job xử lý tài liệu | Thread nền trong tiến trình backend, có tiếp tục job bị gián đoạn; chưa có hàng đợi bền vững |
| Mã mẫu template | Đã gỡ (D-63): `POST /api/v1/chat` trả 404; hỏi đáp chỉ qua `/conversations` có xác thực |
| Hiệu năng | Mỗi câu hỏi gồm 1 lượt router + 1–2 lượt LLM, timeout 60 giây mỗi lượt gọi LLM (D-64). Đo ở lượt UAT `UAT_20261003_0933`: chat p50 6,8 s, p95 13,4 s (n=35), **chưa đạt** mục tiêu < 3 s. Tạo đề từ PDF chạy đồng bộ |
| Chi phí | Có số liệu token/chi phí thật từ D-60; lượt cũ trước đó tính 0 |
| Khả năng mở rộng | SQLite một tiến trình; embedding free tier khoảng 1000 request/ngày |

---

## 7. Điểm cần cải tiến

> **Kết luận hiện trạng (2026-10-03):** MVP đã đủ chức năng nhưng **chưa đủ bằng chứng để dùng cho người dùng thật**.
> - **Đã có:** frontend sạch lint/typecheck và có trong CI; UAT tự động mức API, lượt mới nhất **16 Pass / 0 Fail / 22 Blocked** trên 38 ca (`docs/uat/`).
> - **Còn thiếu:** độ chính xác trên holdout (chưa có dataset do GV soạn); GV chấm hoặc thao tác UI cho các ca Blocked; độ trễ chưa đạt; phiên đăng nhập chưa bền vững.
>
> Thứ tự đề xuất:
> 1. Ổn định bản hiện tại (OP-0, OP-7, UX-4): **đã xong**.
> 2. Bằng chứng chất lượng (AI-1, OP-5, OP-9).
> 3. Vận hành (OP-4, UX-3, OP-1, OP-2, UX-1).
> 4. Nâng chất lượng và mở rộng (P2, P3).

Các điểm được xếp theo mức ưu tiên. **P1** là nên làm trước khi mở rộng người dùng thật, **P2** là nâng chất lượng, **P3** là mở rộng phạm vi.

### 7.1 Chất lượng AI và trích dẫn
| # | Điểm cần cải tiến | Hiện trạng | Đề xuất | Ưu tiên |
|---|---|---|---|---|
| AI-1 | Đo độ chính xác chính thức | Bộ eval/RAGAS đã có khung nhưng chưa có kết quả trên dữ liệu SE101 | Chạy benchmark 100 mẫu theo PRD v1 §13 trên SE101, công bố kết quả; giữ holdout ngoài repo (BR-12) | P1 |
| AI-2 | Chunk quá lớn | Chunk artifacts khoảng 2.000 ký tự, trải tới 12 trang; trang được suy ra bằng heuristic trùng từ | Chia lại chunk theo trang hoặc theo mục (400–800 token như PRD v1 §10.2), embedding lại khi có quota | P2 |
| AI-3 | Đoạn trích và nhãn bằng heuristic | **Một phần:** đoạn trích chọn theo cặp âm tiết + độ hiếm và bao trọn nội dung trải nhiều slide (D-66, D-70); nhãn kiểm theo từng câu bằng từ khóa (D-73). Vẫn có thể lệch khi câu trả lời diễn đạt khác tài liệu; **chưa** kiểm chứng ngữ nghĩa từng ý | Dùng embedding câu để chọn đoạn trích. Nếu chấp nhận thêm chi phí: LLM giám khảo kiểm từng cặp câu–nguồn | P2 |
| AI-4 | Chưa có rerank | Cosine top-k + cộng điểm từ khóa hiếm (D-68) | Thêm rerank (cross-encoder hoặc LLM rẻ) cho top-20 → top-6 | P2 |
| AI-5 | Kiểm tra câu hỏi do AI tạo | **Một phần (D-74):** **đã kiểm câu trích chứng minh đáp án có thật trong nguồn** cho trắc nghiệm, flashcard, điền khuyết và đề từ PDF tài liệu học; mục không kiểm được bị loại; câu trùng bị lọc. **Chưa kiểm** đáp án đúng về ngữ nghĩa; chưa phát hiện câu có nhiều đáp án đúng hoặc câu mơ hồ | Thêm một lượt LLM giám khảo cho mỗi bộ câu để loại đáp án sai và câu có nhiều đáp án đúng; đánh dấu câu nghi ngờ cho giảng viên | P2 |
| AI-6 | PDF scan / PDF dài | Tạo đề chỉ đọc PDF có lớp chữ, tối đa ~60k ký tự | OCR (đã có MinerU) và chia theo chương rồi gọi nhiều lần | P3 |

### 7.2 Sản phẩm và trải nghiệm
| # | Điểm cần cải tiến | Hiện trạng | Đề xuất | Ưu tiên |
|---|---|---|---|---|
| UX-1 | Phản hồi chậm, không stream | Câu trả lời và tạo đề trả về một lần | Stream câu trả lời (SSE); tạo đề chạy nền và có thông báo khi xong | P1 |
| UX-2 | Bài cũ giữ trích dẫn cũ | **Một phần:** đã tính lại đoạn trích và khoảng trang cho các tin nhắn đã lưu (có sao lưu DB trong `backup/`). Các thay đổi thuật toán về sau vẫn chỉ áp dụng cho nội dung mới | Làm script tính lại chạy được sau mỗi lần đổi thuật toán | P3 |
| UX-3 | Hạn mức chưa cấu hình được | Trang "Cấu hình hạn mức" là bản xem thử | Lưu hạn mức (câu hỏi/ngày, token/tháng theo môn) vào DB, dùng chung với số liệu chi phí D-60 | P1 |
| UX-4 | Giao diện còn code cũ | **Đã xong (D-63)**: gỡ `/chat`, `/hub`, `/lecturer/*`, `AppShell`, `study-launcher`… (14 file, bản sao trong `backup/`); còn 17 cảnh báo lint | Dọn cảnh báo lint còn lại | P3 |
| UX-5 | Lịch học | Chỉ có link Google Calendar + `.ics` | OAuth đồng bộ hai chiều nếu nhà trường cho phép | P3 |
| UX-6 | Thông báo | Chưa có thông báo khi tài liệu được duyệt hoặc đề được phát hành | Thông báo trong ứng dụng (và email nếu cần) | P3 |

### 7.3 Vận hành, bảo mật, mở rộng
| # | Điểm cần cải tiến | Hiện trạng | Đề xuất | Ưu tiên |
|---|---|---|---|---|
| OP-1 | Bảng giá chi phí là ước tính | Giá mặc định theo giá công khai dòng Gemini Flash-Lite, chưa khớp hoá đơn vilao | Chốt giá theo hợp đồng; thêm chi phí embedding; cảnh báo khi vượt ngân sách | P1 |
| OP-2 | Quota embedding free tier | Khoảng 1000 request/ngày; hết quota thì trả 503 | Gói trả phí hoặc embedding tự host; hàng đợi + backoff đã có | P1 |
| OP-0 | Frontend sạch lint/type | **Đã xong** (0 lỗi; còn 17 cảnh báo); CI đã chạy `npm run lint` + `npm run build` | Thêm `tsc --noEmit` vào CI; dọn dần 17 cảnh báo | P3 |
| OP-3 | Cơ sở dữ liệu | Mặc định SQLite; `docker-compose.yml` đã cấu hình PostgreSQL nhưng chưa kiểm chứng; vector vẫn tính bằng NumPy | Kiểm chứng chạy trên PostgreSQL, migration có phiên bản (Alembic), sao lưu/phục hồi; pgvector khi nhiều môn | P2 |
| OP-4 | Phiên đăng nhập và xác thực | Phiên lưu trong bộ nhớ: mất khi restart, không chạy được nhiều worker; login_id + mật khẩu | Lưu phiên trong DB hoặc Redis (P1, trước khi triển khai); SSO của trường (OIDC/SAML) nếu cần (P2) | P1 |
| OP-5 | Kiểm thử | 24 test backend (giai đoạn MVP không viết test mới). **Đã chạy UAT tự động mức API** (`eval/uat/run_uat_mvp.py`, 38 ca): 16 Pass / 0 Fail / 22 Blocked; các ca Blocked cần GV chấm, thao tác UI, fixture hoặc dataset | Bổ sung test cho tạo đề từ PDF, chi phí, trích dẫn hoạt động học, phân quyền admin; GV nghiệm thu các ca Blocked; e2e trên UI | P1 |
| OP-6 | Nhiều môn | Chỉ SE101; 8 môn trong `data/artifacts` chưa có PDF gốc | Bổ sung PDF gốc, nạp bằng `seed`/luồng tải lên; kiểm tra chọn môn, cách ly dữ liệu, BR-13 | P3 |
| OP-7 | Code mẫu template | **Đã xong (D-63)**: gỡ `/api/v1/chat`, `/api/v1/status`, `agents/graph.py`, node/tool mẫu; bản sao trong `backup/` | — | — |
| OP-8 | Job xử lý tài liệu | Thread nền trong tiến trình backend | Hàng đợi bền vững + worker riêng, giới hạn đồng thời; dùng chung cho tạo đề từ PDF | P2 |
| OP-9 | Hồ sơ Demo Day | `presentation/` mới có README. `eval/results/report.md` đã có số liệu UAT, độ trễ, chi phí; **chưa có** độ chính xác trên holdout | Slide, video, số liệu eval holdout | P1 |

---

## 8. Tiêu chí nghiệm thu MVP

| # | Tiêu chí | Cách kiểm |
|---|---|---|
| AC-1 | Câu trả lời học thuật có `[n]`; bấm vào mở đúng trang hoặc khoảng trang của tài liệu | Hỏi 10 câu trên SE101, đối chiếu trang PDF |
| AC-2 | Hoạt động học chỉ hiện nguồn sau khi trả lời, mỗi mục có đoạn trích và trang riêng | Tạo flashcard / trắc nghiệm / điền khuyết, lật/trả lời rồi kiểm tra |
| AC-3 | Nội dung không có "nguồn n"; có tên tài liệu thật | Kiểm tra 10 câu hỏi do AI tạo |
| AC-4 | Giảng viên tạo đề từ PDF, sửa, phát hành; sinh viên làm và được chấm ở server | Thao tác trên tài khoản `giangvien` → `sinhvien` |
| AC-5 | Admin không gửi được câu hỏi (403), xem được chi phí AI theo ngày / chức năng / môn | Đăng nhập `quantri`; gọi API chat trả 403 |
| AC-5b | Câu hỏi/thẻ AI soạn đều có câu trích chứng minh đáp án, có thật trong nguồn; không có câu trùng | UAT LA-01, LA-02, QZ-02 |
| AC-6 | Tài liệu bị thu hồi / khóa không còn được trích dẫn hay mở | Khóa khẩn cấp rồi hỏi lại |
| AC-7 | `ruff` / `pytest` / `tsc` / `eslint` / `npm run build` sạch (đạt ở máy dev; CI chạy tất cả trừ `tsc`) | CI |
| AC-8 | Kết quả eval trên SE101 và UAT có bằng chứng lưu lại. **Một phần:** UAT tự động đã có báo cáo; chưa có holdout và chưa có GV nghiệm thu | `eval/results/report.md`, `docs/uat/uat_mvp_report_UAT_*.md` |

---

## 9. Truy vết quyết định

Các điểm lệch so với v1 đều ghi ở `docs/decisions/decision_log.md`. Các quyết định chính của bản MVP:
- D-27, D-28: router chọn môn và trợ lý.
- D-30, D-37: thẻ học và lịch.
- D-38: Quiz Builder.
- D-44, D-45: chủ đề theo chương; chuyển ngay sang chat khi tạo bài.
- D-47 → D-50: dữ liệu SE101, chunk artifacts, `page_map`, khoảng trang.
- D-53, D-54: merge giao diện, khung chung.
- D-55 → D-58: trích dẫn tại chỗ, đoạn trích riêng, trích dẫn hoạt động học, tên tài liệu.
- D-59: UI giảng viên và tạo đề từ PDF.
- D-60: chi phí AI.
- D-61: khu quản trị, admin không dùng Hỏi đáp.
- D-62: bỏ hồ sơ cá nhân.
- D-63: gỡ code mẫu template và giao diện cũ.
- D-64: không tin model về đáp án của đề có sẵn; timeout LLM.
- D-65: log JSON, `X-Request-ID`, mã hỗ trợ.
- D-66, D-67, D-70: đoạn trích theo cặp âm tiết; số trên badge theo đoạn dẫn chứng; bao trọn nội dung nhiều slide.
- D-68: ổn định chất lượng khi đổi sang `gpt-4o-mini`; cộng điểm từ khóa hiếm.
- D-69: đáp án đúng chia đều A–D.
- D-71: nút Đăng nhập demo.
- D-72: chốt chặn 4 lỗi P1 trong UAT với `gpt-4o-mini`.
- D-73: kiểm trích dẫn theo từng câu.
- D-74: kiểm câu trích chứng minh đáp án cho câu hỏi AI soạn.
