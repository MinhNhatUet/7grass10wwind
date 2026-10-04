# 68 — Trích dẫn bao trọn nội dung trải nhiều trang liền nhau (D-70)

## Yêu cầu
"có những nội dung nó ở nhiều trang liền thì sao citation vẫn chưa bao quát được"

## Nguyên nhân
- Đoạn trích tối đa 500 ký tự, cửa sổ khoảng 15 dòng quanh dòng tốt nhất, và chỉ lưu **một** số trang.
- Giữa hai slide có dòng số trang và chân trang, cùng các nhãn biểu đồ do MinerU tách ra. Các dòng này bị tính chi phí như dòng lạc đề, nên cửa sổ không bao giờ vượt ranh giới slide. Trên 39 đoạn trích của các tin nhắn thật, 0 đoạn trải nhiều trang.
- Dữ liệu SE101 có **64 cặp slide nối tiếp** (cùng tiêu đề hoặc có thêm "(2)"), ví dụ "Các đặc trưng của PM" ở trang 7–8 và "Các giai đoạn phát triển" ở trang 12–14.

## Đã làm (`src/services/assistants/__init__.py`)
1. **Dòng trung tính** (không cộng, không trừ điểm): số trang, nhãn biểu đồ một từ ("chart_body", "Time", "0.136"), dòng lặp lại sau khi bỏ số và dấu (tiêu đề slide nối tiếp, chân trang). Đoạn trích không mở đầu và không kết thúc bằng dòng trung tính.
2. **Giữ lõi trích chính xác** (ngưỡng 1/3 dòng tốt nhất), sau đó `_extend_continuation()` nối sang slide kế trước hoặc kế sau **chỉ khi**:
   - đó là slide nối tiếp (cùng tiêu đề, hoặc tiêu đề thêm "(tiếp)" / "(2)"), **và**
   - slide đó có dòng liên quan.

   Slide khác chủ đề, dù có từ trùng, không bị kéo vào.
   - Lần thử trước hạ ngưỡng xuống 1/5 làm đoạn "bảo trì thuận lợi" phình sang "Vận hành và bảo trì" ở slide khác, nên đã bỏ cách đó.
3. Độ dài tối đa tăng lên 900 ký tự. Trả và lưu `page_end`: `{quote, page, page_end}` cho cả chat (`occurrence_evidence`) và từng mục hoạt động học (`attach_evidence`).
4. Phần hiển thị bỏ dòng số trang, nhãn biểu đồ và chân trang lặp; giữ tiêu đề slide làm mốc khi nối nhiều slide.
5. Frontend (`ChatMessage.tsx`, `learning-cards.tsx`, `lib/api.ts`): badge hiện khoảng trang `page–page_end`.

## Kết quả

| Ca | Trước | Sau |
|---|---|---|
| "Các đặc trưng của PM" (liệt kê đặc trưng) | trang 8 (3 dòng) | **trang 7–8**, đủ cả hai slide, không còn nhãn biểu đồ |
| "Các giai đoạn phát triển PM (70s–80s)" | trang 12 (chỉ tiêu đề) | **trang 12–14** |
| "Bảo trì thuận lợi nhờ tài liệu" | trang 6 | trang 6, 2 dòng, không phình ra |
| "Phân tách đặc tả và phát triển" | trang 4 | trang 4 |

- Tính lại dẫn chứng cho 29 tin nhắn trong DB thật (sao lưu `backup/app_before_evidence_pagerange_2026-10-03.db`): 10 đoạn trích nay trải nhiều trang.

## Kiểm tra
- `ruff`: đạt. `pytest`: 24 passed. Frontend `tsc`: 0 lỗi.
- UAT QA-01 25/25, LA-01 23/23, LA-02 25/25 tiêu chí máy (Blocked vì chờ GV).

## Giới hạn
- Chân trang chỉ xuất hiện 1 lần trong chunk (MinerU bỏ phần lớn chân trang) thì không nhận ra được. Ví dụ ". Bộ môn Công nghệ phần mềm…" trong `chk_e4dd626debff6fe7`.
- Chỉ nối được các trang nằm trong cùng chunk; nếu nội dung bị cắt sang chunk khác thì cần chia lại chunk theo mục (PRD v2 AI-2).
- Chưa kiểm phần hiển thị trên giao diện. Chưa commit.
