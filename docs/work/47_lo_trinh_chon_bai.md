# 47 — Tạo lộ trình: chọn bài thay vì gõ nội dung

**Yêu cầu:** "cả chỗ tạo lộ trình nữa" (giống ôn tập ở log 46: chọn, không phải gõ, chọn được nhiều). **Quyết định:** D-52.

## Thay đổi
- `learning-hub.tsx`:
  - tách `LessonPicker({courseId, max, picked, onChange})` dùng chung: thẻ bài/chương ✓, ô lọc, "Đã chọn n/max", chip bỏ từng bài, "Bỏ chọn hết", "Chọn tất cả" (khi max ≥ số bài);
  - export `Chapter`, `lessonLabel`, `describeLesson`;
  - `TopicPractice` dùng `LessonPicker` (max 5).
- `learning/plans/page.tsx`:
  - ô "Nội dung muốn học" thay bằng "Chọn bài muốn học" (`LessonPicker` max 15);
  - nút tạo bị khoá khi chưa chọn bài; đổi môn thì xoá bài đã chọn;
  - gửi `goal` = "Bài 3: …; Bài 5: …" và `topics` (mô tả từng bài khi ≥ 2 bài); tin nhắn "Lập lộ trình học 3 bài (3, 5, 12) …".
- Backend:
  - `LearningOptions.topics` tối đa 15;
  - `academic.evidence()` nhiều chủ đề: k = max(1, round(1,5 × top_k / n)) đoạn mỗi chủ đề.

## Kiểm tra (Edge headless ở cổng 3000, `sinhvien`)
- Form lộ trình: không còn ô gõ nội dung; 15 thẻ bài; nút tạo bị khoá khi chưa chọn.
- "Chọn tất cả" → 15/15; "Bỏ chọn hết", rồi chọn Bài 3, 5, 12 → 3/15.
- Tạo 3 ngày → sang chat ngay. Lộ trình: Ngày 1 "Tiến trình và mô hình tiến trình phần mềm", Ngày 2 "Thu thập và phân tích yêu cầu", Ngày 3 "Tổng quan về kiểm thử phần mềm" (khớp 3 bài đã chọn).
- ruff sạch; `tsc` sạch; ESLint sạch ở `learning-hub.tsx` và `learning/plans/page.tsx`.
- Dữ liệu thử: một lộ trình Draft 3 bài trong tài khoản `sinhvien` (xoá được bằng 🗑).
