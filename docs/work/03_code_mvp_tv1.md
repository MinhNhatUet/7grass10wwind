# 03 — Code MVP công cụ TV1 (UC-01…UC-06)

- **Ngày:** 25/09/2026 · **Nhánh:** `feat/BL-03-tv1-eval-mvp` (tạo từ `main`, chưa commit)
- **Yêu cầu:** code bản MVP đầy đủ theo plans, dùng 3 môn tạm, không viết test. Người dùng đồng ý phân bổ 34/33/33 và ngưỡng gần trùng 0,9. Tên biến tài khoản test do người dùng tự điền.
- **Liên quan:** BL-01, BL-02, BL-03, BL-27, BL-28, BL-30; FR-06; BR-01/06/07/12; PRD 11, 12.1, 13, 14.
- **Kết quả:** hoàn thành phần code và tài liệu. Chưa có kết quả eval thật vì chưa có dataset và chưa có API.

## Sự cố trong quá trình làm

`data/raw/manifest.json` (manifest chuẩn theo MVP-5) không còn trên máy. Thư mục `data/raw` bị sửa lúc 20:33. Người dùng chọn dùng `data/raw/books/manifest.books.json` làm chuẩn (D-03). Plans đã được cập nhật theo.

## File tạo

| File | Nội dung |
|---|---|
| `eval/config.json` | Config tập trung: manifest, dataset, phân bổ 34/33/33, ngưỡng, API contract (D-10), perf |
| `eval/common.py` | Đọc config/manifest/JSONL, sha256, run_id, git commit, percentile, exit code |
| `eval/schemas.py` | EvalConfig, Manifest*, TestCase (17 trường PRD 13.3), SafetyCase, RubricGrade, RunOutput, RunConfig |
| `eval/rubric.py` | 4 tiêu chí, luật pass, accuracy không làm tròn |
| `eval/validate_dataset.py` | Luật D-01…D-14, `--lock` ghi checksum |
| `eval/datasets/README.md` | Định dạng dữ liệu, cách kiểm tra và khóa |
| `scripts/validate_manifest.py` | Luật M-01…M-11, M-13; độ phủ mẫu; điều kiện phục vụ BR-01; `--report` |
| `eval/runner/client.py` | HTTP client theo PRD 11, fixtures, `$ENV:`, phát hiện endpoint chưa có |
| `eval/runner/run_accuracy.py` | Runner accuracy; holdout bắt buộc đã khóa |
| `eval/runner/actions.py`, `assertions.py`, `run_safety.py` | Safety suite nhiều bước; case blocked không tính pass |
| `eval/scoring/__init__.py`, `auto_checks.py`, `grade_sheet.py`, `report.py` | A-01…A-04, phiếu chấm CSV (primary/second/resolution), báo cáo accuracy/safety |
| `eval/perf/load_test.py`, `perf_report.py` | Đo NFR-01/02 bằng truy vấn tập dev |
| `docs/decisions/*` | Decision log D-01…D-10, câu hỏi mở Q-01…Q-13, sổ pain point |
| `docs/uat/*` | Checklist UAT-01…20 (chép PRD), báo cáo UAT, đo giá trị, cổng phát hành (MỞ) |
| `docs/handover/van_hanh.md` | Cách chạy bộ công cụ |

## Kiểm tra đã chạy (kết quả thật)

- `ruff check eval scripts/validate_manifest.py`: All checks passed. `ruff format --check`: 21 files already formatted.
  - Lưu ý: `ruff check scripts/` báo 8 lỗi trong các file **có sẵn của template** (`submit_log.py`…). Tôi không sửa các file đó.
- `python scripts/validate_manifest.py --check-files --report data/raw/manifest_report.md`: exit 0, 0 ERROR, 62 WARNING. Chi tiết:
  - Đủ điều kiện phục vụ: **0/30** (`usage_permission=dev_only_pending_confirmation`, `ai_processing_allowed=null`).
  - PTTA-10 không có file (tải lỗi curl 56).
  - Thiếu mẫu kiểm thử: pptx, pdf_scan, duplicate, two_versions, graded_material.
  - 26 nguồn chưa đối chiếu giấy phép.
- `validate_dataset` (dev/holdout/safety), `run_accuracy`, `run_safety`, `load_test`: đều exit 2 với thông báo "chưa có dữ liệu", không tạo kết quả giả.
- Chạy thử logic bằng script tạm trong scratchpad với mock HTTP. Script không ghi vào `data/`, **không phải bằng chứng eval**:
  - endpoint chưa có dẫn tới `blocked`;
  - response hợp lệ dẫn tới `ok` và auto-check hoạt động;
  - phiếu chấm thiếu lý do bị từ chối;
  - safety cho kết quả đúng: lộ trường là `fail`, bị từ chối 403 là `pass`, thiếu endpoint là `blocked`.
- App thật không chạy được trên máy (thiếu fastapi), nên chưa thử được với API thật.

## Việc còn lại / câu hỏi mở

1. Người dùng tạo `data/eval/fixtures/<env>.json` và thêm biến vào `.env` (D-08).
2. Người gán nhãn tạo dev/holdout/safety theo `eval/datasets/README.md`, review với GV, rồi `--lock`.
3. Chốt với TV2/TV3 hợp đồng request API và cách ánh xạ ID nguồn (Q-11, D-10).
4. Q-13: có commit `docs/decisions`, `docs/uat`, `docs/handover` không. Chưa commit gì (R-05).
5. `ruff` trong CI và Makefile chưa bao gồm `eval/`, `scripts/`. Cần hỏi người dùng trước khi sửa.
