# 11 — Làm sạch text khi ingest (D-29)

- **Ngày:** 26/09/2026
- **Yêu cầu:** "bạn chưa làm sạch dữ liệu". Người dùng chọn: làm sạch text khi ingest.
- **Liên quan:** FR-07.2, FR-07.4, PRD 9.3, BR-07, FR-08.4, FR-05.4.
- **Kết quả:** hoàn thành; sách đã phát hành được xử lý lại qua đủ HITL.

## Khảo sát text cũ (TRR-07, 182 chunk)

Header lặp mỗi trang ("2.2 Forbidden Position Permutations 51"), 187 ligature (ﬁ/ﬂ), 47 từ ngắt gạch nối, chữ hoa bị tách ("F undamentals"), dấu “ lỗi font TeX (\How), ký tự điều khiển (vd "P" + mã 0x13 + "olya" thay cho "Pólya"), trang mục lục, trang chỉ mục cuối sách, dòng toàn dấu chấm (hình vẽ lưới).

## Thay đổi

- `src/services/text_cleaning.py` (mới): làm sạch theo từng trang (giữ locator), dựa trên tần suất và từ vựng của chính tài liệu, không đoán chữ bị mất.
- `src/services/ingestion.py`: gom text thô theo trang → làm sạch → chia chunk; bỏ trang mục lục/chỉ mục khỏi index.
- `src/services/documents.py`: ghi thống kê làm sạch vào audit `extract`; hàm `reprocess` tạo version mới cùng tệp gốc (BR-07).
- `scripts/reprocess_books.py` (mới): xử lý lại bản Published qua đủ luồng trích xuất → gửi duyệt → reviewer khác duyệt → index.
- `src/services/conversations.py`: câu trả lời Hub cũ có mọi tài liệu không còn phục vụ → che bằng thông điệp "nguồn không còn khả dụng" (trước đó vẫn ghi "Tìm thấy 1 tài liệu" với danh sách rỗng).

## Kết quả thật (TRR-07, 155 trang)

- Thống kê làm sạch: control 3.634 ký tự, ligature 178, dấu TeX 79, header/footer 119 dòng, số trang 23, gạch nối 49, chữ hoa tách 31, tàn dư hình vẽ 46 dòng, mục lục trang 3–5, chỉ mục trang 153–155. Chunk 182 → 170.
- Số từ giảm 2,4% (đúng phần header/số trang/mục lục bị bỏ); đã kiểm tra trang 104: không mất câu nào. "A graph" giữ nguyên (không nối nhầm).
- Xử lý lại 2 lần (lần 2 sau khi thêm luật hình vẽ/chỉ mục): mỗi lần bản mới Published, bản cũ Archived.
- Truy xuất: "cây và cây khung" trước khớp trang 11 toàn dấu chấm → nay khớp trang 105 (Trees); điểm 0,525 vẫn dưới ngưỡng 0,55 (Q-17, do câu tiếng Việt ngắn trên sách tiếng Anh). "Hệ số nhị thức" → trang 16 binomial coefficients (0,659).
- Câu trả lời cũ trích bản đã Archived: đều bị che khi đọc lại (7 academic/explain/quiz + 3 hub).
- ruff pass, pytest 5 passed.

## Giới hạn còn lại

- Chữ viết hoa bị tách giữa từ viết hoa ("COROLLAR Y") chưa xử lý. Header của mục ngắn (<3 trang, vd "5.5 Trees 105") còn sót.
- Công thức toán trích xuất kém (pypdf) — cần công cụ khác hoặc OCR toán (ngoài MVP).
- Chữ mất do ligature bị rơi ở tầng PDF ("briey") không sửa (không đoán).

## Bổ sung (sau phản hồi "lúc ấn nguồn nó hiện như này")

Panel nguồn hiện một khối chữ dính liền, có `/x35/x2E/x33 /x48/x61…`, `: : :`, và đoạn liên quan nằm lẫn trong bài tập của mục trước.

- **Giải mã tiêu đề hex:** pypdf trích tiêu đề mục thành `/xHH`, cả sách có 124 chỗ. Nay giải mã khi có từ 2 mã liên tiếp trở lên, ví dụ "5.3 Hamilton Cycles and Paths". Còn sót 2 chỗ dạng lẻ.
- **Dấu ba chấm TeX:** `: : :` được đổi thành "…" (335 chỗ).
- **Giữ cấu trúc dòng thay cho gộp cả đoạn:** xuống dòng ở tiêu đề mục, DEFINITION/THEOREM/Proof/Exercises, mục "1.", "(a)", và câu kết thúc bằng dòng ngắn. Chỉ nối các dòng bị ngắt giữa câu.
- **Chunk chồng lấn bắt đầu ở ranh giới từ:** trước đây có chunk mở đầu bằng "heorem" thay vì "Theorem".
- **Đoạn hỗ trợ trong panel nguồn (FR-10.1, UI-06):** LLM trả kèm câu trích nguyên văn cho từng [n]. Backend chỉ nhận câu trích nếu có thật trong chunk (PRD 10.4); không có thì chọn dòng trùng từ nhiều nhất với các câu gắn [n]. Citation lưu đoạn này; `/citations/{id}/source` trả thêm `quote`. Panel tô sáng đoạn hỗ trợ và để phần còn lại trong "Xem cả đoạn ở trang N".
- **Xử lý lại sách 2 lần nữa** qua đủ HITL; mỗi lần bản mới Published, bản cũ Archived.

**Kiểm tra với LLM thật:**
- "Chu trình Hamilton là gì?" → [2] trang 100, đoạn hỗ trợ "DEFINITION 5.3.1 A cycle that uses every vertex in a graph exactly once is called a Hamilton cycle…".
- "Hệ số nhị thức là gì?" → [5] trang 14 "DEFINITION 1.2.5 The number of subsets of size k…".
- Mọi đoạn hỗ trợ đều có nguyên văn trong đoạn nguồn.
- ruff pass, pytest 5 passed, frontend typecheck + build pass.

**Giới hạn:** công thức toán vẫn trích xuất kém ("n 1" thay cho "n−1", "v; e1" thay cho "v, e1"), do font toán TeX và pypdf. Không tự đoán ký hiệu.
