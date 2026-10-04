# 30 — Ẩn nguồn khi tạo đề/lộ trình, hiện dẫn chứng sau khi trả lời

**Yêu cầu:** Khi tạo đề hoặc lộ trình thì không hiện dẫn chứng. Khi người học chọn đáp án thì hiện dẫn chứng cùng đáp án đúng.

**Liên quan:** BL (Learning Assistant), FR-03, BR-04. Dữ liệu nguồn vẫn đi kèm câu trả lời, chỉ thay đổi thời điểm hiển thị, nên mọi nội dung học thuật vẫn có trích dẫn.

## Thay đổi (chỉ frontend)
- `frontend/src/components/learning-cards.tsx`
  - Thêm `HIDE_SOURCE_KINDS` gồm quiz, diagnose, mcq, flashcards, cloze, plan.
  - Thêm `noCite()`, bỏ các nhãn `[n]` / `[1, 3]` khỏi văn bản hiển thị.
  - Thêm khối `Evidence`: đoạn trích, tên tài liệu, trang và nút "Mở nguồn" (mở đúng trang trong trình xem).
  - Trắc nghiệm: câu hỏi không còn nguồn. Sau khi chọn sẽ hiện ✓/✗, "đáp án đúng: X", phần giải thích và dẫn chứng.
  - Flashcard: dẫn chứng chỉ hiện khi đã lật thẻ.
  - Điền khuyết: dẫn chứng chỉ hiện sau khi bấm "Kiểm tra".
  - Lộ trình: bỏ `[n]` khỏi tiêu đề, mục tiêu, hoạt động, tự kiểm tra và cảnh báo. Nội dung gửi sang Google Calendar và chủ đề ôn tập cũng bỏ `[n]`.
  - Không đổi: phần Giải thích và đánh giá tự luận (chẩn đoán). Hai phần này là kết quả sau khi làm, nên vẫn giữ nguồn.
- `frontend/src/app/page.tsx`
  - Với các loại trong `HIDE_SOURCE_KINDS`: ẩn mục "Nguồn tham khảo" cuối tin nhắn và bỏ `[n]` trong nội dung.
  - Truyền `msg.sources` vào `LearningCards` để dựng dẫn chứng.

## Kiểm tra
- `tsc --noEmit` không lỗi. ESLint không lỗi ở `learning-cards.tsx`. 8 lỗi còn lại ở `page.tsx` là code sẵn có của TV4, không nằm ở các dòng đã sửa.
- Chạy thử bằng Edge headless, backend 8100 chạy trên bản sao DB, frontend 3100. Luồng: sinhvien01 → Toán rời rạc → "cây khung" → trắc nghiệm 5 câu.
  - Trước khi chọn: không có "Nguồn tham khảo", không có "Dẫn chứng", không có `[n]`.
  - Sau khi chọn A (sai): hiện "✗ Chưa đúng — đáp án đúng: C.", phần giải thích và 1 khối dẫn chứng (trích Theorem 5.5.5). Bấm "Mở nguồn" thì mở trình xem tài liệu.
- Đã tắt server thử, xoá bản sao DB và build lại frontend với backend mặc định.
