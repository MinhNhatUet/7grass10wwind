# 36 — Nguồn tham khảo hiện chữ, công thức đúng (xử lý lại 2 sách)

**Yêu cầu:** "hiện câu nma ch bị embedding…". Người dùng chọn phương án "Chữ, công thức đúng" (có kèm xử lý lại 2 cuốn). **Quyết định:** D-42 (thay D-41).

## Thay đổi
- `src/services/ingestion.py`:
  - `_pdfium_page_text()` duyệt từng ký tự pdfium (cỡ chữ, baseline):
    - chữ < 85% cỡ thân bài, lệch baseline trong khoảng 0.8×cỡ chữ → chỉ số dưới/trên Unicode;
    - baseline không lấy từ toán tử lớn (∑∏∫…);
    - bỏ xuống dòng giả sát chỉ số;
    - mã "0" của font CMSY ở vị trí trên → `′`.
  - Đóng textpage / page / document của pdfium sau khi dùng (trước đó pdfium cảnh báo "still open").
- `src/services/text_cleaning.py`:
  - chuyển bảng `SUB` / `SUP` sang đây;
  - NFKC giữ nguyên ký tự sub/sup (`SCRIPT_KEEP`), vì trước đó NFKC biến `₁` thành `1`.
- Gỡ phần ảnh đoạn trích của log 35. `sources.py` và `page_render.py` về đúng bản đã commit; thẻ nguồn và Dẫn chứng hiện chữ như trước.
- Dữ liệu:
  - sao lưu `data/app.db` (sqlite backup API) vào scratchpad: `app_before_reprocess.db`;
  - chạy `scripts/reprocess_books.py --course COURSE-01`:
    - Combinatorics: `ver_866c9fe84c0d9edf`, 166/166 đoạn có embedding;
    - Number Theory: `ver_85637ca129c48f25`, 165/165;
    - 2 bản cũ chuyển Archived.

## Kết quả (trích xuất mới)
- tr.101: `n ≥ 3, and d(v) + d(w) ≥ n`; `d(v) ≤ n₁ − 1 … ≤ n₁ + n₂ − 2 < n`
- tr.12: `A₁ ∪ · · · ∪Aₙ = ∑ⁿᵢ₌₁ mᵢ`; tr.11: `K₃,₃`
- Number Theory: `a ≡ b (mod n)`, `a′`, `a² ≡ 1 (mod p)`, `100 = 2²· 5²`
- Hạn chế: nhãn trục biểu đồ (NTB tr.23) bị hiểu thành số mũ; phân số / ma trận vẫn dàn phẳng; đôi chỗ thiếu khoảng trắng sau chỉ số (`y⁰term`).

## Kiểm tra
- ruff sạch; `tsc` sạch.
- Hỏi mới "Định lý Ore…" (sinhvien01, hội thoại `conv_588d8ff649826e51`, để lại làm mẫu): 200 sau 16 giây. Trích dẫn hiện `n ≥ 3 … n₁ − 1 … n₁ + n₂ − 2 < n`; ảnh chụp giao diện khớp bản xem trước người dùng đã chọn.
- **Tác động:** câu trả lời cũ có trích dẫn trỏ bản đã Archived bị che bằng thông báo nguồn đã thu hồi (FR-05.4), vd. hội thoại "chu trình hamilton". Cần hỏi lại. Muốn khôi phục thì dùng bản sao DB.
