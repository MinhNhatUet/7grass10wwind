# 81 — Chặn job index phát hành lại nguồn đã thu hồi

## Bước 1 — Phạm vi và thiết kế

- Yêu cầu: sửa riêng mục A của review; BL-13/14, FR-08, BR-01/07, giữ audit BR-11.
- Đã đọc lại `docs/coding_agent_rules.md`, code index/worker/withdraw, ORM và regression hiện có.
- Không thay đổi các file người dùng đang có, không commit/push, không gọi AI thật.
- Thiết kế: cập nhật trạng thái version bằng compare-and-swap theo state/revision; thu hồi tăng revision và đánh dấu job queued/running thất bại với SOURCE_WITHDRAWN (dùng trạng thái có sẵn, không cần migration/UI mới).
- Publish, cập nhật bản hiện hành, archive bản trước và audit nằm trong cùng transaction. Worker phải dừng khi mất state/revision; nhánh lỗi cũng không được ghi đè Withdrawn thành Failed.
- Regression dùng SQLite file tạm với hai Session độc lập, mock embedding; kiểm tra thu hồi trước job, giữa embedding, khi provider lỗi và sát publish, cùng luồng publish/retry hợp lệ.

## Bước 2 — Triển khai và regression đầu tiên

- `src/services/documents.py`: thêm CAS state/revision ở đầu index, khi thất bại và trước publish; kiểm tra trạng thái trước/sau mỗi lần embedding; không giữ transaction qua provider call.
- Thu hồi tăng revision trong DB, refresh current-version pointer để không bỏ sót publish vừa hoàn tất, vô hiệu hóa queued/running jobs trong cùng transaction.
- Worker bỏ qua job terminal; nhánh exception dùng CAS để không ghi đè nguồn thu hồi. Archive bản trước chỉ cập nhật khi bản đó còn Published.
- Dùng trạng thái job failed hiện có + SOURCE_WITHDRAWN; không thêm migration hoặc đổi API/UI.
- Tạo `tests/test_index_withdrawal.py`: hai Session trên SQLite file tạm, race điều khiển qua mock callback; thêm test pointer stale và rollback khi audit thất bại.
- Kiểm tra đầu: 25 test thuộc hai file regression pass; Ruff phát hiện một import thừa trong file test mới, đã bỏ. Sau format: toàn suite 34 passed, Ruff sạch.
- Không gọi AI thật, không thay frontend hoặc dữ liệu sản phẩm.

## Bước 3 — Kiểm chứng cuối và đối chứng trước/sau

- Thêm regression approval thiếu/sai revision, resume Indexing dùng lại embedding và revision thay đổi giữa provider call.
- Toàn suite: `APP_ENV=test OPENAI_API_KEY=test-key pytest tests/ -q --tb=short` → **38 passed** (24 cũ + 14 ca mới).
- `ruff check src/ tests/` → sạch; `ruff format --check src/services/documents.py tests/test_index_withdrawal.py` → đạt; `git diff --check` → đạt.
- Đối chứng RED: nạp riêng hàm `_run_index` từ HEAD vào một tiến trình Python tạm, giữ nguyên file working tree và chạy regression thu hồi giữa embedding. Test thất bại đúng vì trạng thái cuối là Published thay vì Withdrawn. Bản vá hiện tại vượt qua cùng regression. Lần đầu đối chứng lỗi decode mặc định Windows cp1252; chạy lại với UTF-8 thành công.
- Kiểm tra git status: chỉ sửa source `src/services/documents.py`, thêm `tests/test_index_withdrawal.py` và nhật ký này; không can thiệp các file untracked đã có của người dùng.

## Kết quả và giới hạn

- Thu hồi tăng revision; job cũ không thể chuyển version về Indexing/Published hoặc ghi đè thành Failed. Job queued/running được đánh dấu failed/SOURCE_WITHDRAWN; worker không nhận lại job terminal.
- Publish và current-version pointer/audit cùng transaction; publish vừa hoàn tất vẫn bị withdraw chặn và xóa pointer đúng dù reviewer giữ ORM snapshot cũ.
- Retry lỗi provider và resume Indexing hợp lệ vẫn hoạt động; không cần migration, không đổi contract API/UI.
- Regression dùng hai Session độc lập trên SQLite file tạm và callback điều khiển thứ tự xen kẽ, không phải stress test đa luồng hoặc kiểm chứng PostgreSQL live. Queue/lease chống nhiều worker chạy cùng job vẫn nằm ngoài phạm vi mục A.
- Không commit/push.
