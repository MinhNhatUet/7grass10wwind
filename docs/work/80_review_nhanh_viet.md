# 80 — Kiểm tra code mới ở các nhánh (nhánh `viet`)

## Yêu cầu
"check code mới ở các nhánh". Chỉ đọc và chạy kiểm tra, không sửa code. Không sửa nhánh của người khác.

## Kết quả
- Có thay đổi mới ở **`viet`**: 2 commit của Việt, `4476628` "ocr data" (30/09) và `8ab29bc` "knowledge hub" (03/10). `binh` và `quanghung` không đổi so với lần kiểm trước.
- `8ab29bc` chép code `ndmnhat` ở mốc `7432c46` vào một commit thường (không phải commit merge), kèm phần mới:
  - `src/ingestion/**`: pipeline MinerU, OCR, công thức, chunking;
  - `src/knowledge_hub/**` và `knowledge_hub_database.py`: hybrid BM25 + vector + RRF + reranker;
  - cột `chunks.section`; các script reindex / import;
  - test mới.
- **Nghiêm trọng:** `.env.example` có **OpenAI API key thật** (commit `8ab29bc`, đã push).
- Lỗi khác:
  - `requirements.txt` bỏ các thư viện đang dùng: sqlalchemy, numpy, pypdf, pypdfium2, python-multipart, psycopg2, langchain-google-genai, langchain-community;
  - `.gitignore` bỏ các dòng ignore `docs/rules`, `docs/plans`, `cong_viec_TV1`, file media, scratch;
  - đổi embedding sang OpenAI 1536 chiều (DB hiện tại dùng Gemini 768);
  - commit thư mục `embedding_tmp/` (2,5 MB: vector + preview nội dung SE101) và `package-lock.json` ở thư mục gốc;
  - Dockerfile dùng `--trusted-host`;
  - sửa hook ghi AI log (`.codex/hooks.json`, `scripts/log_hook.py`).
- Phân quyền Knowledge Hub làm đúng: scope tính ở server, chỉ bản Published / không khóa / hiện hành, lọc `allowed_version_ids` trước khi tìm.

## Kiểm tra
- Worktree tạm trên `origin/viet`, đã xóa sau khi chạy.
- `ruff check`: đạt.
- `pytest`: 110 passed, 2 failed. Hai test hỏng do máy thiếu PyMuPDF (`fitz`), không phải lỗi logic.

## Việc cần làm (báo người dùng)
- Việt thu hồi key ngay, gỡ khỏi lịch sử nhánh.
- Đưa phần mới vào bằng cherry-pick hoặc PR trên `ndmnhat` mới, bỏ các thay đổi lỗi ở trên.
