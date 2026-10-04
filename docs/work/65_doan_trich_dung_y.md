# 65 — Đoạn trích của [n] sai ý/sai trang và trùng nhau (D-66)

## Yêu cầu
"citation hiện sai trang, những citation khác nhau lại hiện giống nhau"

## Chẩn đoán (trên tin nhắn thật mới nhất, câu hỏi về mô hình thác nước)
- Số trang của dẫn chứng **khớp đúng** đoạn trích (không phải lỗi `page_map`). Lỗi ở **khâu chọn đoạn trích**:
  - `[1]#1` nói về các hoạt động (định nghĩa yêu cầu, thiết kế…) nhưng lấy dòng "Tiến trình… các hoạt động" ở trang 3, đáng ra là trang 5. Hai dòng bằng điểm vì chỉ chung các âm tiết phổ biến, và thuật toán lấy dòng đứng trước.
  - `[1]#3` "bảo trì thuận lợi" có chứa dòng đúng, nhưng đoạn trích mở đầu bằng "Chậm có phiên bản…" (do mở rộng ngược để đủ 200 ký tự) và trùng với `[1]#5`.
- Gốc rễ: chấm điểm theo âm tiết rời, trong khi tiếng Việt mang nghĩa ở **cặp âm tiết** ("bảo trì", "yêu cầu", "định nghĩa").

## Đã làm
- `evidence_passage` trong `src/services/assistants/__init__.py`:
  - Điểm mỗi dòng = tổng IDF (độ hiếm trong chunk) của cặp âm tiết chung với câu, cộng 0,3 × IDF của âm tiết rời. Cặp có ở mọi dòng ("kiểm thử" trong bài kiểm thử) ≈ 0 điểm.
  - Dòng đã dùng cho lần `[n]` trước bị nhân 0,6 khi chọn dòng tốt nhất, để các lần trích khác nhau không lặp một đoạn.
  - Đoạn trích là cửa sổ dòng liên tiếp có tổng (điểm − 1/3 điểm dòng tốt nhất) lớn nhất, dòng đầu phải liên quan. Bỏ việc đệm cho đủ độ dài; tối đa 500 ký tự.
  - Trả thêm danh sách dòng đã dùng; `occurrence_evidence` và `attach_evidence` theo dõi các dòng đã dùng cho mỗi `[n]`.
- **Tính lại `payload.evidence`** cho 20 tin nhắn có citation trong DB thật (sao lưu trước ở `backup/app_before_evidence_recompute_2026-10-02.db`). Không gọi LLM hay embedding.

## Kết quả trên tin nhắn đó (6 lần `[1]`)

| Lần | Câu trong câu trả lời | Đoạn trích (trang) |
|---|---|---|
| #0 | phân tách đặc tả và phát triển | "– Phân tách các giai đoạn đặc tả và phát triển." (4) |
| #1 | các hoạt động | "Triển khai và kiểm thử đơn vị / Tích hợp và kiểm thử hệ thống…" (5) |
| #2 | phù hợp khi yêu cầu hiểu rõ | "• Chỉ phù hợp khi yêu cầu được hiểu rõ" (6) |
| #3 | bảo trì thuận lợi nhờ tài liệu | "• Bảo trì thuận lợi / – Tài liệu được làm tốt" (6) |
| #4 | khó đáp ứng thay đổi | "Khó đáp ứng khi khách hàng thay đổi yêu cầu" (6) |
| #5 | sai sót phát hiện muộn | "Chậm có phiên bản thực hiện được – Sai sót phát hiện muộn…" (6) |

## Kiểm tra
- `ruff`: đạt. `pytest`: 24 passed.
- UAT chạy lại trên code mới: QA-01 đạt 42/42 tiêu chí máy, LA-01 đạt 23/23, LA-02 đạt 25/25. Các ca vẫn Blocked vì chờ GV.

## Bổ sung D-67: số trên badge
- Người dùng: "đúng trang rồi nhưng số citation bị trùng nhau luôn là 1". Một chunk trải nhiều trang nên model gắn `[1]` cho mọi ý.
- `ChatMessage.citeLabels()` đánh 1, 2, 3… cho mỗi (nguồn, trang, đoạn trích) khác nhau theo thứ tự xuất hiện; `CitationBadge` nhận `label`. Không đổi backend hay API.
- Giả lập trên 3 tin nhắn thật: thác nước 1·1·1·1·1·1 thành 1·2·3·4·5·6; kiểm thử 1·1·1·1·4 thành 1·2·3·4·5. `tsc` 0 lỗi.

## Lưu ý
- Thuật toán vẫn là heuristic (không dùng LLM); với câu diễn đạt rất khác tài liệu, đoạn trích có thể chưa trọn ý. PRD v2 AI-3 đã ghi hướng nâng cấp.
- Chưa kiểm phần hiển thị trên giao diện.
- Chưa commit.
