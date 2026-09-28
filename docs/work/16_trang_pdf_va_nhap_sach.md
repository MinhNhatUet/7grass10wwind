# 16 — Xem dạng trang PDF + nhập thêm sách cho 3 môn

- **Ngày:** 26/09/2026
- **Yêu cầu:** "ko hiện hết tài liệu và cx ko hiện kiểu trang".
  - Nguyên nhân 1: DB mới có 3 cuốn, đều thuộc môn 1, và chỉ 1 cuốn đã Published. Thư viện chỉ hiện bản Published.
  - Nguyên nhân 2: trình đọc chỉ hiện text trích xuất.
  - Người dùng chọn: thêm **pypdfium2** và **nhập vài cuốn mỗi môn**.
- **Liên quan:** FR-04.4, FR-04.5, FR-08, FR-10.6, BR-01, BR-03, BR-10, R-06; D-31, D-32, Q-18.

## Thay đổi

- **Dependency:** `pypdfium2==5.13.0` trong requirements.txt (D-31).
- **`src/services/page_render.py`:** render 1 trang PDF thành PNG.
  - Chiều rộng 400–1600 px, làm tròn tới 100.
  - Cache LRU 64 ảnh; có khóa vì pdfium không an toàn đa luồng.
- **`GET /documents/{id}/versions/{vid}/pages/{n}/image?width=`** (bổ sung ngoài PRD 11.2):
  - Kiểm tra quyền giống endpoint đọc chữ. Phần kiểm tra được tách thành `_servable()` dùng chung cho cả hai.
  - Không có quyền → 404. Nguồn đã thu hồi → 410. PPTX → 409. Render lỗi → 502 retryable.
  - Header `Cache-Control: private, no-store`.
- **`SourceReader`:**
  - Có nút chuyển "Trang gốc / Văn bản" (chỉ với PDF).
  - Ảnh được tải kèm Bearer thành object URL (`fetchObjectUrl` trong `lib/api.ts`), không có link công khai.
  - Ở dạng trang, trang đích hiện thêm "Đoạn được trích". Ảnh lỗi thì hiện text thay thế.
  - Thư viện mặc định dạng trang; panel nguồn trong Hội thoại mặc định dạng văn bản (để tô sáng đoạn trích).
- **Quyền duyệt (D-32):** cấp quyền duyệt COURSE-02/03 cho `reviewer_course_01` qua `PUT /admin/users/{id}/memberships`, có audit và lý do.
- **Nhập sách qua đủ HITL** (`scripts/import_books.py --confirm-dev-usage`), xem mục Kết quả bên dưới.

## Kiểm tra (kết quả thật)

- Ảnh trang 100 sách môn 1:
  - 200, `image/png`, 216 KB, 0,52 giây;
  - tôi đã mở ảnh xem: đúng trang "5.3 Hamilton Cycles and Paths", có công thức và định dạng gốc.
- Trang 9999 → 404. SV môn 2 → 404. Không có token → 401.
- ruff pass; pytest 5 passed; `npm run typecheck` và `npm run build` pass. Giao diện chưa xem bằng trình duyệt.

## Bổ sung: thanh chuyển trang cố định

- **Phản hồi của người dùng:** "chuyển trang phải lướt xuống mới được". Nguyên nhân: nút "đọc trang sau" nằm dưới cuối danh sách ảnh trang.
- **Sửa:**
  - `SourceReader` có thanh điều hướng luôn nằm trên phần nội dung: **‹ [ô số trang] / N ›**, nhập số rồi Enter để nhảy trang, phím ← → và PageUp/PageDown cũng chuyển trang.
  - Có nút "Về đoạn trích" khi đang ở trang khác trang được trích.
  - Dạng **Trang gốc** hiện **từng trang một** như trình xem PDF. Dạng **Văn bản** vẫn cuộn liền và tự cuộn tới trang được chọn.
  - Khi nhảy xa, trình đọc tải lại cửa sổ quanh trang mới để không sinh dải trang rỗng.
  - Bỏ ô "Đến trang" riêng ở Thư viện vì đã trùng chức năng.
- **Kiểm tra:** `npm run typecheck` và `npm run build` pass. Chưa thử bằng trình duyệt.

## Kết quả nhập sách

Tất cả đều đi qua đủ luồng upload → trích xuất → gửi duyệt → `reviewer_course_01` duyệt → index.

| Môn | Sách | Trạng thái | Chunk đã embedding |
|---|---|---|---|
| 01 | Elementary Number Theory (bản đang chờ duyệt từ trước) | **Published** | 175/175 |
| 01 | Discrete Mathematics: An Open Introduction (549 trang) | Failed (RateLimit) | 512/569 |
| 02 | Open Data Structures (Java edition) | Failed (RateLimit) | 0/314 |
| 02 | Think Data Structures | Failed (RateLimit) | 8/168 |
| 03 | Competitive Programmer's Handbook | Failed (RateLimit) | 0/285 |
| 03 | Introduction to Theory of Computation | Failed (RateLimit) | 0/245 |

- **Nguyên nhân:** hết hạn mức **theo ngày** của Gemini free tier. Lỗi 429 ghi `embed_content_free_tier_requests, limit: 1000`, và gọi lại sau 70 giây vẫn bị từ chối.
- **Hệ quả:** trong lúc này, `embed_query` cho câu hỏi chat cũng bị 429, nên hỏi đáp trả lỗi kỹ thuật (retryable) cho tới khi hạn mức được đặt lại.
- **Cách tiếp tục:** sau khi hạn mức được đặt lại, chạy `python scripts/retry_index.py` (script mới). Script dùng `documents.retry` (có audit) và chỉ embedding phần còn thiếu. Còn khoảng 1.060 chunk, nhiều hơn hạn mức 1.000/ngày, nên có thể cần chạy qua 2 ngày hoặc dùng key trả phí.
- *Triple Code Model* vẫn ở NeedsReview: PDF dạng ảnh, không trích được chữ, và dự án không có OCR (D-22).

## Giới hạn

- Slide PPTX chưa render được thành ảnh, vẫn hiện dạng văn bản.
- Chạy lại `seed_users.py` có thể đặt lại quyền duyệt theo fixtures (D-32).
- Ảnh trang không cho chọn hay copy chữ. Muốn copy thì chuyển sang dạng "Văn bản".
