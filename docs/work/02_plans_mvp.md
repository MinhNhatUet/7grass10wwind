# 02 — Sửa plans sang bản MVP

- **Ngày:** 25/09/2026
- **Yêu cầu:** sửa plan cho bản MVP: dùng dữ liệu hiện có (3 môn tạm, sẽ đổi sau), đúng cấu trúc, không viết test, làm MVP đầy đủ.
- **Liên quan:** BL-01/02/03/27/28/30 (MVP), BL-36/40 (ngoài MVP); PRD 13.1–13.2, 13.6, NFR-02.
- **Kết quả:** hoàn thành. Chỉ sửa tài liệu, chưa có code.

## File sửa

| File | Thay đổi |
|---|---|
| `docs/plans/README.md` | Viết lại: thêm quyết định MVP-1…MVP-5; cây thư mục MVP là chuẩn duy nhất; thêm `eval/config.json` (nội dung mẫu) và `eval/common.py`; exit code thống nhất; bỏ `tests/` |
| `UC-01` | Thêm bước ghi MVP-1…5 vào decision log; câu hỏi phân bổ holdout theo 3 môn |
| `UC-02` | Chọn `manifest.json` làm chuẩn; thêm luật M-12 (so sánh với books manifest, chỉ báo cáo); model đặt trong `eval/schemas.py`; bỏ test |
| `UC-03` | Thêm `config.json`, `common.py`; D-04 đọc phân bổ từ config (34/33/33 là đề xuất); bỏ test |
| `UC-04`, `UC-05`, `UC-06` | Bỏ test; thêm mục kiểm tra MVP (ruff + chạy CLI, API chưa có thì exit 3 `blocked`) |
| `UC-07`, `UC-08` | Đánh dấu ngoài MVP |
| `docs/rules/coding_agent_rules.md` | R-08: thêm ngoại lệ MVP không viết unit test |

## Kiểm tra

- Không có code nên không chạy ruff/pytest.
- `grep` xác nhận không còn tham chiếu `tests/` trong các file UC.

## Câu hỏi mở

1. Phân bổ holdout 34/33/33 cho 3 môn là đề xuất, cần người dùng xác nhận (xem README mục 4).
2. Ngưỡng gần trùng 0,9 và concurrency 1 là đề xuất.
3. Tên biến môi trường cho tài khoản test (`EVAL_*`) chưa chốt.
