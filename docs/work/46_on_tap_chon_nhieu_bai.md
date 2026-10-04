# 46 — Ôn tập: chọn nhiều bài, không tự gõ chủ đề

**Yêu cầu:** "ở phần ôn tập bạn cho chọn chủ đề đi đừng bắt nhập có thể chọn nhiều chủ đề". **Quyết định:** D-51.

## Thay đổi
- `learning-hub.tsx` (`TopicPractice` → "Ôn tập theo bài"):
  - thẻ bài/chương bấm để chọn/bỏ (ô ✓, `aria-pressed`), tối đa 5, quá thì các thẻ còn lại bị khoá;
  - dòng "Đã chọn n/5" với chip bỏ từng bài và nút "Bỏ chọn hết";
  - ô lọc chỉ lọc danh sách (bỏ ô tự gõ chủ đề);
  - gửi `topic` (mô tả tổng hợp) và `topics` (mỗi bài: tên + các mục). Tin nhắn: "Ôn tập Bài 3, Bài 12 — …".
- `api/conversations.py`: `LearningOptions.topics` (tối đa 5, cắt 600 ký tự mỗi mục).
- `academic.multi_topic()` + `evidence()`: truy xuất riêng từng chủ đề, gộp xen kẽ theo hạng, bỏ trùng chunk.
- `orchestration.learning_node`: bọc `multi_topic(opts.topics)`; tách phần chọn hành động sang `_learning_action`.

## Kiểm tra
- TestClient (bản sao DB): chọn Bài 3 (tiến trình) + Bài 12 (kiểm thử), trắc nghiệm 6 câu → 200.
  - Nguồn: 03-process models, 04-RUP, 12_Testing.
  - Câu hỏi: 3 về tiến trình (lặp, thác nước, RUP), 3 về kiểm thử (V&V, hộp đen, hộp trắng).
  - Gửi 6 chủ đề → 422.
- Edge headless ở cổng 3000:
  - không còn ô gõ chủ đề;
  - chọn 3 bài → "Đã chọn 3/5", bỏ 1 bài → "2/5";
  - lọc "kiểm thử" hiện đúng các bài kiểm thử.
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning-hub.tsx`.
- Backend 8000 đang chạy với `--reload` nên đã nhận code mới (route API không đổi).
