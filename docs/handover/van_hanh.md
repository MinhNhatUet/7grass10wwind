# Vận hành bộ công cụ kiểm chứng TV1 (BL-02, BL-03, BL-27, BL-28, BL-30)

Tài liệu này chỉ mô tả công cụ đã có code. Hướng dẫn SV/GV và vận hành sản phẩm sẽ viết khi các tính năng tương ứng chạy được thật (UC-06 bước 5). Runbook sự cố của sản phẩm xem PRD 16.2.

## 1. Chuẩn bị

- Python 3.11 và `pip install -r requirements.txt`. Công cụ chỉ dùng `pydantic`, `httpx`, `python-dotenv`.
- Mọi lệnh chạy từ gốc repo. Tham số mặc định nằm trong `eval/config.json`: đường dẫn, phân bổ môn, timeout, ngưỡng.
- **Khi đổi môn/dữ liệu**, chỉ cần sửa `manifest_path` và `holdout.course_allocation` trong config. Không phải sửa code.
- Tài khoản test khai trong `data/eval/fixtures/<env>.json`. Mẫu xem docstring của `eval/runner/client.py`. Mật khẩu để trong `.env` và tham chiếu bằng `$ENV:TÊN_BIẾN`.

## 2. Mã thoát

| Mã | Ý nghĩa |
|---|---|
| 0 | OK |
| 1 | Dữ liệu/kết quả có lỗi, hoặc chưa đạt |
| 2 | Lỗi config, hoặc thiếu file/dữ liệu |
| 3 | Blocked: API chưa có endpoint hoặc không kết nối được. Không ghi kết quả. |

## 3. Quy trình

```bash
# BL-02 — kiểm kê nguồn
python scripts/validate_manifest.py --check-files --report data/raw/manifest_report.md

# BL-03 — kiểm tra và khóa dữ liệu kiểm chứng
python -m eval.validate_dataset --split dev
python -m eval.validate_dataset --split holdout
python -m eval.validate_dataset --split holdout --lock --by "<tên>"
python -m eval.validate_dataset --split safety

# BL-27 — accuracy: chạy → kiểm tra tự động → chấm → báo cáo
python -m eval.runner.run_accuracy --split holdout --fixtures demo
python -m eval.scoring.auto_checks --run-id <run_id> --fixtures demo
python -m eval.scoring.grade_sheet export --run-id <run_id> --grader "<tên>" --role primary
python -m eval.scoring.grade_sheet import --run-id <run_id> --file data/eval/runs/<run_id>/grades/primary_<tên>.csv
python -m eval.scoring.grade_sheet export --run-id <run_id> --grader "<tên 2>" --role second
python -m eval.scoring.grade_sheet export --run-id <run_id> --grader "<GV>" --role resolution   # các case bất đồng
python -m eval.scoring.report --run-id <run_id>

# BL-28 — safety
python -m eval.runner.run_safety --fixtures demo
python -m eval.scoring.report --run-id <run_id> --safety

# BL-30 — hiệu năng (truy vấn lấy từ tập dev)
python -m eval.perf.load_test --scenario search --fixtures demo --account <tài khoản> --note "corpus v?, cache off"
python -m eval.perf.load_test --scenario answer --fixtures demo --account <tài khoản>
python -m eval.perf.perf_report --run-id <run_id>
```

### Mức Nâng cao (BL-36, BL-40)

```bash
# Tập router riêng và bộ mở rộng (>100 mẫu)
python -m eval.validate_dataset --split router
python -m eval.validate_dataset --split extended
python -m eval.router.run_router --fixtures demo

# Chỉ số nguồn và RAGAS trên một lần chạy accuracy đã có (judge qua get_llm, cần AI_* trong .env;
# answer_relevancy cần EMBEDDING_PROVIDER/EMBEDDING_MODEL/EMBEDDING_DIMENSION + GEMINI_API_KEY)
python -m eval.ragas.retrieval_metrics --run-id <accuracy_run> --fixtures demo
python -m eval.ragas.run_ragas --run-id <accuracy_run>
python -m eval.ragas.report --run-id <accuracy_run>

# So sánh baseline và advanced: điền run_id vào eval/benchmark/configs/*.json trước
python -m eval.benchmark.compare
```

Cài phụ thuộc eval riêng: `pip install -r eval/requirements.txt` (RAGAS tách khỏi phụ thuộc của app, D-79). Cần Python 3.11 hoặc 3.12 để cài `ragas==0.4.3`. Trên 3.14, phụ thuộc `scikit-network` không build được.

## 4. Nguyên tắc

- Holdout phải được khóa (`--lock`) trước khi chạy. Runner từ chối chạy khi checksum không khớp (BR-12).
- Sau khi đã sửa hệ thống dựa trên lỗi holdout, lần chạy lại phải thêm cờ `--known-set-regression` (PRD 13.7 bước 7).
- Báo cáo trong `eval/results/` chỉ chứa số liệu và `case_id`. Output thô và phiếu chấm nằm trong `data/eval/runs/` (bị ignore).
- Không dùng kết quả từ mock làm bằng chứng. Không để LLM tự chấm thay người chấm.
- RAGAS là chỉ số chẩn đoán, báo riêng khỏi accuracy. Ngưỡng chỉ được dùng khi `eval/ragas/config.json` có `thresholds_confirmed=true`, sau khi đã được phê duyệt.
