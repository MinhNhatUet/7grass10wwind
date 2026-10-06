# UC-07 — BL-36: RAGAS và mở rộng bộ kiểm chứng (Should · trong phạm vi theo MVP-6)

| Thuộc tính | Nội dung |
|---|---|
| Backlog | BL-36 · E7 · Should · Ưu tiên C · 8 SP |
| Owner | TV1 |
| Phụ thuộc | BL-31 (router), BL-32 (hybrid), BL-33 (OCR), BL-34 (tổng hợp): cần để **chạy** so sánh; code viết được trước |
| Truy vết | FR-14, PRD 13.5, UAT-18 |
| Quyết định | MVP-6 / D-11…D-14 (người dùng chốt 25/09/2026) |

## 1. User story

> Là nhóm AI/QA, tôi muốn đo từng khía cạnh retrieval/generation để xác định nguyên nhân chất lượng và so sánh cấu hình.

## 2. Tiêu chí nghiệm thu (backlog)

- Kết quả RAGAS tách riêng khỏi accuracy do người chấm.
- Ngưỡng đề xuất (faithfulness ≥0,85; answer relevancy ≥0,80; context precision ≥0,75) phải được **xác nhận trước khi chạy**. Đây không phải yêu cầu gốc.
- Giữ lại các lượt đánh giá lỗi, không bỏ âm thầm.
- Bộ mở rộng tách khỏi dev và có nhãn kiểm tra.
- Báo đúng số mẫu thực tế và giới hạn.

## 3. Chỉ số (PRD 13.5) và cách lấy dữ liệu

| Chỉ số | Cần | Lấy từ đâu | Module |
|---|---|---|---|
| Faithfulness | answer + contexts | output run; contexts theo `context_source` | `ragas/run_ragas.py` |
| Answer relevancy | question + answer (+ embedding) | output run; embedding qua `get_embeddings()` | `ragas/run_ragas.py` |
| Context precision | question + contexts + reference | contexts + `reference_answer` | `ragas/run_ragas.py` |
| Retrieval recall@k | danh sách chunk đã retrieve | **chỉ khi** API/trace trả về (`context_source=trace:<path>`); nếu không có thì blocked | `ragas/retrieval_metrics.py` |
| Citation source/locator hit | citations + `reference_locators` | output run + `fixtures.refs` | `ragas/retrieval_metrics.py` |
| Citation support/coverage | người chấm | phiếu chấm tiêu chí citation (UC-04) | `ragas/report.py` (đọc lại) |
| Router accuracy | `body.assistant` so với nhãn chấp nhận | tập router riêng (`RouterCase`) | `router/run_router.py` |
| Latency/cost | output run | `latency_ms`; token/cost chờ BL-25 | `benchmark/compare.py` |

### Nguồn context (`context_source` trong `eval/ragas/config.json`)

- `citation_quotes` (mặc định): lấy `citations[].quote` trong response PRD 11.3. Đây là **xấp xỉ**, vì chỉ gồm đoạn đã trích dẫn chứ không phải toàn bộ context đã retrieve. Báo cáo phải ghi rõ giới hạn này.
- `trace:<đường.dẫn>`: đường dẫn trong body tới danh sách context thật, khi TV2/TV3 cung cấp (Q-14). Không tự thêm field vào API của người khác.

## 4. Kiến trúc

```mermaid
flowchart LR
    RUN[data/eval/runs/&lt;accuracy_run&gt;/outputs.jsonl] --> ADP[ragas/adapter.py]
    DS[dataset của run] --> ADP
    RC[ragas/config.json] --> ADP & RR
    ADP --> RR[ragas/run_ragas.py\njudge = get_llm(temperature=0)\nembedding = get_embeddings()]
    RR --> OUT[runs/&lt;accuracy_run&gt;/ragas_&lt;ts&gt;.jsonl\nmỗi case × metric, giữ lỗi]
    RUN --> RM[ragas/retrieval_metrics.py] --> OUT2[runs/&lt;run&gt;/retrieval_metrics.json]
    OUT --> REP[ragas/report.py] --> RES[eval/results/&lt;run&gt;_ragas.md]
    OUT2 --> REP
    RT[data/eval/router/router_v1.jsonl] --> RO[router/run_router.py] --> API[(/api/v1)]
    RO --> ROUT[runs/&lt;router_run&gt;/router_results.jsonl + eval/results/&lt;id&gt;_router.md]
```

- RAGAS chạy **trên output của một lần chạy accuracy đã có**, không gọi lại hệ thống, để đo đúng câu trả lời mà người chấm đã chấm.
- Judge LLM chỉ lấy qua `src/services/llm.py::get_llm()` (R-12), bọc bằng wrapper của ragas.
- Mỗi lần chạy RAGAS ghi `ragas_version`, model judge, model embedding, metric, `context_source` và cờ `thresholds_confirmed`.

## 5. Cấu trúc thư mục

```text
eval/ragas/
├── __init__.py
├── config.json            ragas_version, metrics, context_source, judge_temperature, thresholds (đề xuất), thresholds_confirmed=false
├── adapter.py             build_samples(run, context_source) → list[RagasSample] + danh sách case bị loại (có lý do)
├── run_ragas.py           CLI: --run-id (accuracy run) → ragas_<ts>.jsonl
├── retrieval_metrics.py   CLI: --run-id --fixtures → retrieval_metrics.json
└── report.py              CLI: --run-id → eval/results/<run_id>_ragas.md
eval/router/
├── __init__.py
└── run_router.py          CLI: --fixtures → runs/<id>/router_results.jsonl + báo cáo
eval/schemas.py            + RouterCase; TestCase.split thêm "extended"
eval/config.json           + datasets.router, datasets.extended
eval/validate_dataset.py   + --split router | extended
data/eval/router/          🔒
data/eval/extended/        🔒
```

## 6. Schema bổ sung

- `RouterCase`: `case_id`, `course_id`, `permission_fixture`, `question`, `conversation_context`, `accepted_assistants` (list gồm `academic`/`learning`/`hub`, ≥1 phần tử; giá trị lấy từ trường `assistant` của PRD 11.3), `label_author`, `label_reviewer`, `dataset_version`.
- `extended`: dùng `TestCase` với `split="extended"`. Không giới hạn số lượng. Không được trùng hoặc gần trùng với dev và holdout (D-06).

## 7. Các bước

1. Thêm schema, config và validator cho router/extended.
2. `retrieval_metrics.py` (không cần thư viện ngoài).
3. `adapter.py` và `run_ragas.py` (ragas 0.4.3), rồi `report.py`.
4. `router/run_router.py`.
5. Trước khi chạy nghiệm thu: xác nhận ngưỡng RAGAS, đổi `thresholds_confirmed=true` và ghi vào decision log.

## 8. Kiểm tra (MVP, không viết test)

- Chạy ruff trên `eval/`.
- CLI khi chưa có run hoặc dataset: exit 2. Khi thiếu cấu hình LLM hoặc embedding: exit 3 (blocked) và ghi rõ lý do, không tạo điểm.

## 9. Không được làm

- Không dùng điểm RAGAS thay cho accuracy. Không gộp hai loại điểm này trong cùng một bảng kết luận.
- Không bỏ lượt judge lỗi. Lượt lỗi được ghi `error` và đếm riêng, không tính vào trung bình.
- Không coi ngưỡng đề xuất là đã đạt hay đã duyệt khi `thresholds_confirmed=false`.
- Không mở rộng bộ mẫu bằng câu do LLM sinh mà không có nhãn người review.
