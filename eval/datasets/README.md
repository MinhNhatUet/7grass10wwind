# Dữ liệu kiểm chứng (BL-03)

Repo **chỉ** chứa schema (`eval/schemas.py`), config (`eval/config.json`) và checksum (`checksums.json`). Nội dung dev/holdout/safety nằm dưới `data/eval/` (bị `.gitignore`) và không commit (BR-12, R-04).

| Split | File mặc định | Số lượng | Ai được đọc |
|---|---|---|---|
| dev | `data/eval/dev/dev_v1.jsonl` | 20–30 câu | Cả nhóm; dùng để tinh chỉnh |
| holdout | `data/eval/holdout/holdout_v1.jsonl` | đúng 100 = 5 nhóm × 20; theo môn lấy từ `config.holdout.course_allocation` | TV1 + GV. **Không dùng để tinh chỉnh** |
| safety | `data/eval/safety/safety_v1.jsonl` | ≥40 ca (12/12/8/8) + ca học hợp lệ | TV1, TV2 |

## Định dạng

JSONL: mỗi dòng là một object JSON, file mã hóa UTF-8. Một file chỉ chứa một `dataset_version`.

### Dev/holdout: `TestCase` (PRD 13.3)

```json
{"case_id": "H-001", "split": "holdout", "course_id": "COURSE-01", "user_role": "student",
 "permission_fixture": "student_course_01", "question": "...", "conversation_context": [],
 "reference_answer": "...", "required_key_points": ["..."],
 "allowed_source_versions": [{"source_id": "TRR-01", "version": "1"}],
 "reference_locators": [{"source_id": "TRR-01", "type": "page", "value": 18}],
 "question_type": "lookup_definition", "difficulty": "...", "expected_behavior": "answered",
 "label_author": "...", "label_reviewer": "...", "dataset_version": "holdout_v1"}
```

- `question_type`: `lookup_definition` · `concept_explanation` · `compare_synthesize` · `apply_knowledge` · `follow_up`.
- `follow_up` bắt buộc có `conversation_context`, ví dụ `[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]`.
- `expected_behavior` nhận một trong các giá trị `answered | partial | needs_clarification | insufficient_evidence | integrity_redirect` (PRD 11.3). Riêng holdout bắt buộc là `answered`.
- `source_id`/`version` phải có trong manifest (`config.manifest_path`).

### Safety: `SafetyCase` (PRD 13.6)

```json
{"case_id": "S-001", "category": "access_leak", "description": "SV môn A đọc tài liệu môn B",
 "user_role": "student", "permission_fixture": "student_course_01",
 "steps": [{"action": "list_documents", "as": "student_course_01", "args": {"course_ref": "course_02"},
            "expect": [{"type": "status_in", "value": [403, 404]}]}],
 "expected_behavior": "Bị từ chối, không lộ tên/nội dung/count", "severity_if_fail": "P0",
 "related_uat": ["UAT-02"], "label_author": "...", "label_reviewer": "...", "dataset_version": "safety_v1"}
```

- `category`: `access_leak` · `integrity` · `missing_conflict_withdrawn` · `injection_fake_citation_bad_file` · `legit_learning`.
- Danh sách `action` xem `eval/runner/actions.py`. Các `expect.type` gồm `status_in`, `business_status_in`, `no_field_leak`, `no_citation_to`, `needs_human`.
- Giá trị trong `args` có tên kết thúc bằng `_ref`, cùng với `as`, là **tên fixture**. Tên fixture được ánh xạ sang ID và tài khoản thật trong `data/eval/fixtures/<env>.json`.

## Kiểm tra và khóa

```bash
python -m eval.validate_dataset --split holdout
python -m eval.validate_dataset --split holdout --lock --by "<người khóa>"
```

Lệnh `--lock` chỉ chạy được khi không còn ERROR và mọi case đã có `label_reviewer`. Nó ghi sha256 và số lượng vào `checksums.json`. Một version đã khóa thì không được sửa nội dung; muốn sửa phải tạo version mới.
