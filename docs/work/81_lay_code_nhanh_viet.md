# 81 — Lấy phần đáng giữ từ nhánh `viet` (D-75)

## Yêu cầu
"lấy những phần đáng giữ" sau khi review nhánh `viet` (log 80). Liên quan FR-04, BL-15/16/17, BR-03, BR-12, AI-2.

## Đã làm
- Lấy **102 file mới** từ `origin/viet`:
  - `src/ingestion/**`, `src/knowledge_hub/**`, `src/services/knowledge_hub_database.py`;
  - `config/*.yaml`, `fixtures/knowledge_hub/`;
  - 8 script dữ liệu;
  - `tests/knowledge_hub/`, `tests/test_ingestion/`, `tests/test_section_embeddings.py`.
- Bỏ `scripts/embed_artifacts_tmp.py`, `embedding_tmp/`, `package-lock.json`.
- Áp phần sửa vào 10 file sẵn có bằng `git apply --3way`, lấy mốc `7432c46` (bản `ndmnhat` mà Việt đã chép). Không có xung đột; D-68 và D-71 → D-74 còn nguyên. Các file: `orm.py`, `db.py`, `retrieval.py`, `documents.py` (service + api), `sources.py`, `conversations.py`, `hub.py`, `seed_cnpm.py`, `test_document_workflows.py`.
- `requirements.txt`: thêm `PyYAML`, `PyMuPDF`; ghi chú `paddleocr` là tùy chọn. `.gitignore`: thêm thư mục cache pytest và `embedding_tmp/`.
- `ruff format` 3 file mới của Việt; sửa thứ tự import ở `scripts/import_dataset.py`.
- **Sửa lỗi hợp đồng API:** nhánh `viet` hạ giới hạn `page_size` của `GET /documents` từ 100 xuống 50 (UAT bị 422). Đã trả về 100 ở tầng route (`HubConfig(max_page_size=100)` khi gọi từ API). Mặc định của core vẫn 50, để test của Việt vẫn đúng.
- Thêm D-75 vào decision log.

## Không lấy
- `.env.example`: có API key thật; đổi embedding sang OpenAI 1536 chiều.
- `requirements.txt` bản `viet`: bỏ thư viện đang dùng.
- `.gitignore` bản `viet`: bỏ dòng ignore tài liệu cục bộ.
- Dockerfile dùng `--trusted-host`.
- Phần sửa `.codex/hooks.json` và `scripts/log_hook.py`.
- Frontend, docs và README gốc bản cũ.

## Kiểm tra
- `ruff check src tests`: đạt. `ruff format --check src tests`: đạt. `ruff check scripts` còn lỗi cũ ở các script `log_*`, `seed_courses`, `submit_log`; đây là lỗi có từ trước, không sửa.
- `pytest`: 112 passed (đã cài PyMuPDF vào `.venv`).
- UAT toàn bộ `UAT_20261003_1120`: 14 Pass / 4 Fail / 20 Blocked. 4 ca lỗi đều do 422 `page_size`. Sau khi sửa, `UAT_20261003_1129` chạy lại 4 ca đó + DOC-01: ACL-03, DOC-05, DOC-01 Pass; DATA-01, QA-04 Blocked (như trước). Tổng tương đương 16 / 0 / 22.

## Còn lại / rủi ro
- Chưa commit.
- Việt phải **thu hồi API key** đã lộ trên nhánh `viet`.
- Chunk hiện có `section` = NULL cho tới khi chạy reindex / reprocess. Chưa chạy `scripts/reindex_sectioned_chunks.py` trên DB thật.
- Knowledge Hub lai mới thay cách tìm của `GET /documents` và trợ lý Hub. Mới kiểm bằng UAT mức API, chưa kiểm chất lượng kết quả trên giao diện.
