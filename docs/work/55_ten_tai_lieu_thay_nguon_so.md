# 55 — Ghi tên tài liệu thay cho "nguồn 1" (D-58)

## Yêu cầu
Câu hỏi ôn tập: "Điểm đặc trưng nào của mô hình tiến trình thác nước (Waterfall) được đề cập trong nguồn 1". Người dùng: "ai biết đc nguồn một là nguồn nào bạn phải ghi tên sách ra chứ".

## Đã làm
- `BASE_POLICY` thêm quy tắc 9: người học không thấy số thứ tự NGUỒN, nên không viết "nguồn 1" / "tài liệu [2]" trong nội dung; cần nhắc tài liệu thì ghi tên tài liệu.
- `name_sources(text, used)` (`src/services/assistants/__init__.py`): đổi các cụm "nguồn n", "Nguồn số n", "tài liệu [n]", "NGUỒN n" thành `tài liệu “<tên tài liệu>”`.
  - Nếu cụm gốc có ngoặc thì giữ nhãn `[n]` để vẫn hiện badge và xem được nguồn.
  - Số không có trong danh sách nguồn thì giữ nguyên.
- Nơi áp dụng, đều ở bước lưu nên mọi loại câu trả lời đều được xử lý:
  - `_persist_answer` gọi `name_sources` cho nội dung tin nhắn;
  - `attach_evidence` gọi nó cho mọi trường chữ và danh sách lựa chọn của các mục có `sources` (thẻ, câu hỏi, trắc nghiệm, cấp cứu).

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: pass. `pytest`: 27 passed.
- Tự kiểm tra `name_sources` với 6 trường hợp:
  - "trong nguồn 1?" → "trong tài liệu “…”?";
  - "Nguồn số 2" → tên tài liệu;
  - "tài liệu [1]" → tên tài liệu kèm `[1]`;
  - "nguồn 9" (không có trong danh sách) giữ nguyên;
  - "[1]" đứng riêng không đổi;
  - "nguồn mở 1 lần" không đổi.

## Lưu ý
Chỉ áp dụng cho nội dung tạo mới. Cần khởi động lại backend. Chưa commit.
