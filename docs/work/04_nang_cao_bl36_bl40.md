# 04 — Nâng mục tiêu lên mức Nâng cao (BL-36, BL-40)

- **Ngày:** 25/09/2026 · **Nhánh:** `feat/BL-03-tv1-eval-mvp` (chưa commit)
- **Yêu cầu:** "đưa các mục tiêu lên mức cao nhất". Người dùng chọn: nhắm mức Nâng cao, thêm `ragas==0.4.3`, sửa `get_llm()` để đọc `AI_*`.
- **Liên quan:** BL-36, BL-40; FR-11, FR-14; PRD 13.5, 14.3; UAT-18; R-06, R-12.
- **Kết quả:** code và tài liệu xong. Kiểm tra judge RAGAS với LLM thật: xem mục "Kiểm tra".

## File tạo/sửa

| File | Thao tác |
|---|---|
| `src/config.py`, `src/services/llm.py` | Thêm `AI_*` (fallback OPENAI_*), `get_llm(temperature=)`, `get_embeddings()`. **Code dùng chung: cần báo TV2/TV3.** |
| `requirements.txt` | Thêm `ragas==0.4.3` |
| `.env.example` | Thêm `AI_PROVIDER/AI_API_KEY/AI_BASE_URL/AI_MODEL/AI_EMBEDDING_MODEL` (để trống) |
| `eval/schemas.py`, `eval/config.json`, `eval/validate_dataset.py`, `eval/runner/run_accuracy.py` | Thêm tập `router` (RouterCase) và `extended`; D-06 áp dụng cho extended × dev/holdout |
| `eval/ragas/{__init__,config.json,adapter,run_ragas,retrieval_metrics,report}.py` | RAGAS (faithfulness, answer_relevancy, context_precision) + chỉ số nguồn từ citation |
| `eval/router/run_router.py` | Router accuracy (trường `assistant` PRD 11.3) |
| `eval/benchmark/compare.py`, `configs/{baseline,advanced}.json` | So sánh baseline và advanced |
| `docs/uat/advanced_acceptance.md` | Checklist BL-31…39 (trừ BL-35) + kiểm soát bắt buộc |
| `docs/decisions/*` | D-11…D-15, Q-14…Q-16 |
| `docs/plans/README.md`, `UC-07`, `UC-08` | MVP-6; viết lại UC-07/08 |
| `docs/handover/van_hanh.md` | Lệnh cho mức Nâng cao |

## Kiểm tra

- `ruff check` + `ruff format --check` trên `eval`, `scripts/validate_manifest.py`, `src/config.py`, `src/services/llm.py`: pass.
- CLI mới trên trạng thái thật (chưa có dữ liệu/run): `validate_dataset --split router|extended`, `run_router`, `retrieval_metrics`, `run_ragas`, `ragas.report`, `benchmark.compare` đều exit 2 với thông báo rõ ràng.
- Lỗi thật đã phát hiện và sửa: trường `_note` trong `thresholds` làm hỏng parse config RAGAS.
- Smoke trong scratchpad với dữ liệu tổng hợp (không ghi vào `data/`, không phải bằng chứng): adapter loại case timeout kèm lý do; source/locator hit đúng; compare kết luận "Chưa đạt nâng cao" khi chưa chấm.
- Môi trường: Python 3.14 của máy không cài được ragas (`scikit-network` không build được). Đã tạo `.venv` với Python 3.12 (gitignored) để cài.

- `.venv` (Python 3.12) đã cài xong `ragas 0.4.3`. **Lỗi tương thích thật:** ragas 0.4.3 import `langchain_community.chat_models.vertexai`, module đã bị bỏ ở langchain-community 0.4.x. Đã ghim `langchain-community>=0.3,<0.4` vào requirements.txt; sau đó import thành công, `build_metrics` trả đúng `faithfulness`, `answer_relevancy`, `context_precision`.
- Smoke judge thật (1 mẫu tổng hợp trong scratchpad, qua `get_llm()`): cả 2 metric trả NaN và được ghi đúng là lỗi (không bịa điểm). Chẩn đoán: endpoint `AI_BASE_URL` trả **401 INVALID_API_KEY**, cả khi gọi `get_llm().invoke` trực tiếp. Key được đọc đúng (67 ký tự, không có khoảng trắng hay dấu nháy thừa), nên nguyên nhân là key trong `.env` hết hạn hoặc sai, **không phải lỗi code**. `get_llm()` đã đọc đúng `AI_BASE_URL`/`AI_MODEL`.

### Cập nhật sau khi người dùng đổi key và chốt embedding Gemini (D-16)

- `get_llm().invoke` với key vilao mới trả `'OK'`.
- Embedding Gemini `gemini-embedding-001` qua endpoint tương thích OpenAI của Gemini API: trả vector 768 chiều. Không thêm thư viện.
- `src/config.py`: bỏ `AI_EMBEDDING_MODEL`, thay bằng `EMBEDDING_PROVIDER/EMBEDDING_MODEL/EMBEDDING_DIMENSION/GEMINI_API_KEY` (khớp `.env` của người dùng). `get_embeddings()` chọn endpoint theo provider. `.env.example`, `run_ragas.py`, docs đã cập nhật.
- Smoke judge thật (1 mẫu tổng hợp, scratchpad, **không phải bằng chứng**): faithfulness 1.0, answer_relevancy 0.855, context_precision ≈1.0, judge `rk/llms/gemini-3.1-flash-lite`, embedding `gemini/gemini-embedding-001 (768d)`. Pipeline RAGAS chạy thông đầu cuối.
- ruff check + format --check: pass.

## Việc còn lại / câu hỏi mở

- ~~Cập nhật AI_API_KEY~~: xong.

- Q-06/D-15: phê duyệt ngưỡng RAGAS trước khi chạy nghiệm thu.
- Q-14: API/trace trả context thật (hiện dùng `citation_quotes`, là xấp xỉ).
- ~~Q-15~~: đã chốt D-16 (Gemini embedding).
- Q-16: nhóm cam kết những Should nào.
- Báo TV2/TV3 về thay đổi `get_llm()`/`Settings`.
