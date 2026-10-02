# 54 — Citation của mọi hoạt động học: đúng trang, hiện bằng [n] (D-57)

## Yêu cầu
- "phần flashcard chỗ citation cũng v": dẫn chứng bị trùng giữa các thẻ và thiếu ý.
- "sửa phần citation của tất cả các hoạt động học khi đều bị hiện sai trang, và tôi muốn nó hiện dưới [n] và lướt vào thì hiện".

## Nguyên nhân sai trang
Flashcard, điền khuyết, trắc nghiệm, quiz/chẩn đoán và cấp cứu gắn nguồn ở từng mục (`sources: [n]`), không ở câu trong nội dung tin nhắn. Vì vậy khi lưu citation:
- không có `quotes`, nên đoạn trích bị lấy là `chunk.text[:QUOTE_CHARS]`, tức phần đầu chunk;
- `cited_pages` không tìm thấy câu nào chứa `[n]`, nên lấy trang của phần đầu chunk.

Hậu quả là chunk nhiều trang luôn hiện trang đầu (vd. chunk trang 17–28 luôn hiện trang 17). Ngoài ra mọi thẻ cùng nguồn dùng chung một đoạn trích, bị cắt ở 320 ký tự.

## Đã làm
- `src/services/assistants/__init__.py`: thêm `attach_evidence(payload, used)`, thay cho `item_evidence` của bước trước.
  - Hàm duyệt mọi mục có `sources` trong payload ở mọi độ sâu: `items`, `questions`, `sections.*`.
  - Mỗi mục được gắn `evidence = {n: {quote, page}}`, tính theo chính nội dung mục bằng `evidence_passage` (D-56).
  - Hàm trả về các mục dưới dạng "nội dung [n]." để làm "ý" khi tính trang cho citation.
- `src/services/conversations.py` `_persist_answer`:
  - payload được `deepcopy` trước khi sửa;
  - `answer = content + các ý của mục`;
  - đoạn trích của citation lấy theo thứ tự `quotes` → `supporting_quotes(answer)` → đầu chunk;
  - `cited_pages(..., answer, n)` giờ có ý để định đúng trang.
  - Chat thường (có `quotes` và [n] trong câu) không đổi.
- `frontend/src/components/learning-cards.tsx`:
  - Bỏ khung vàng "Dẫn chứng". Dưới mỗi mục giờ là hàng "Nguồn: [n]", với [n] là `CitationBadge` như chat: rê chuột hiện đoạn trích riêng và trang, bấm mở đúng trang nguồn.
  - Mục cấp cứu và ô "Đọc đoạn này trước" của quiz cũng dùng badge này.
  - Dẫn chứng vẫn chỉ hiện sau khi lật thẻ, trả lời hoặc bấm kiểm tra.
- `ChatMessage.tsx`: `LearningCards` nhận `onSource` (mở `Source` với trang đã chỉnh), thay cho `onCite(n)`.
- `frontend/src/lib/api.ts`: thêm `evidence?` vào `StudyItem` và các mục `TriageSections`.

## Kiểm tra
- `ruff check src tests`: pass. `ruff format --check src tests`: 57 file đã đúng định dạng.
- `pytest tests`: 27 passed. `npx tsc --noEmit` (frontend): không lỗi.
- Chạy trên chunk thật nhiều trang nhất của SE101 (trang 17–28, DB mở chỉ đọc), với thẻ lấy nội dung ở trang 28:
  - dẫn chứng của thẻ: trang 28;
  - citation: 28–28;
  - trước khi sửa: 17.

## Lưu ý
- Chỉ áp dụng cho nội dung tạo mới; tin nhắn cũ giữ citation cũ.
- Cần khởi động lại backend.
- Chưa commit.
