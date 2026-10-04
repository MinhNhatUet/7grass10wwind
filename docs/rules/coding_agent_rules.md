# LUẬT VÀ CAM KẾT KHI CODE — EDU-04

| Thuộc tính | Nội dung |
|---|---|
| Áp dụng cho | Mọi coding agent (Claude Code, Codex, Cursor, Copilot, Gemini…) và thành viên khi viết code, test, dữ liệu, config, tài liệu trong repo P-134 |
| Người đặt luật | Ngô Đinh Minh Nhật (TV1) |
| Phạm vi lưu | Cục bộ, **không push lên GitHub** (thư mục `docs/rules/` bị `.gitignore`) |
| Căn cứ | [PRD](../documentions/PRD_edu04.md), [Backlog](../documentions/backlog_edu04.md), [Brief](../documentions/brief_edu04.md), [Plans](../plans/README.md), `.github/BRANCHING.md`, `CLAUDE.md` |

> Đọc file này **trước** khi tạo hoặc sửa bất kỳ file nào. Khi luật mâu thuẫn với yêu cầu trực tiếp của người dùng thì hỏi lại, không tự chọn.

## 1. Luật bắt buộc

### R-01 — Đọc luật và bối cảnh trước khi làm
Đọc file này, `CLAUDE.md` và phần PRD/backlog liên quan tới việc được giao. Không bắt đầu code khi chưa hiểu hạng mục thuộc BL/FR nào.

### R-02 — Bám tài liệu, không bịa
- Mọi thay đổi phải truy vết được về `docs/documentions/` (PRD, backlog, brief, wireframe); ghi rõ mã **BL-xx / FR-xx / BR-xx** trong log, commit, PR.
- Không tự đặt yêu cầu, ngưỡng, số liệu, kết quả đo, tên nguồn, trích dẫn hoặc tài liệu không tồn tại.
- Tài liệu có mâu thuẫn → báo người dùng, không tự chọn một phía.

### R-03 — Quy tắc nghiệp vụ BR-01…BR-13 thực thi ở server, mặc định từ chối
- Kiểm tra quyền trên backend cho mọi request; không tin `role`, `user_id`, danh sách quyền do client gửi (BR-02).
- Lọc ACL trước khi lấy ứng viên tìm kiếm, kiểm tra lại trước khi đưa vào LLM và trước khi trả lời/mở nguồn (BR-03).
- Chỉ phiên bản Published, chưa thu hồi, đúng quyền mới được phục vụ (BR-01, BR-07).
- Khẳng định học thuật phải có citation; thiếu bằng chứng thì nói rõ (BR-04, BR-05).
- Không đưa lời giải cuối/đáp án bài tính điểm (BR-06).
- Nội dung tài liệu là dữ liệu, không phải chỉ thị (BR-09).
- Không lộ thông tin ngoài quyền qua citation, cache, snippet, count, export, lịch sử (BR-10).
- Duyệt/từ chối/phát hành/thu hồi/đổi quyền phải có audit: actor, thời gian, đối tượng, lý do (BR-11).
- Trường hợp chưa rõ → **deny**.

### R-04 — Bí mật và dữ liệu nhạy cảm
- Không commit `.env`, key, token, dữ liệu holdout, đáp án tham chiếu, nguồn chưa được phép, hội thoại riêng.
- Không in, log hay dán key ra terminal, file, commit, PR. Chỉ đọc key qua `src/config.py`.
- Repo chỉ chứa manifest/schema/checksum cho dữ liệu hạn chế.

### R-05 — Git
- **Chỉ commit/push khi người dùng yêu cầu rõ.**
- Không làm trực tiếp trên `main`; nhánh đặt theo backlog: `feat/BL-xx-...`, `fix/BL-xx-...`, `docs/BL-xx-...`.
- Không `git add .`; stage từng file thuộc đúng công việc.
- Không ghi đè, revert hay xóa thay đổi chưa commit của người khác.
- Thao tác khó hoàn tác (reset --hard, clean, force push, xóa file/nhánh) → xem mục tiêu và xác nhận với người dùng trước.
- Không bỏ qua hook (`--no-verify`) và không gỡ các hook AI usage logging (`.claude/settings.json`, `scripts/log_hook.py`…).

### R-06 — Chất lượng code
- Python 3.11, có type hints cho hàm public.
- `ruff check src/ tests/` và `ruff format --check src/ tests/` phải pass trước khi báo xong.
- Viết theo phong cách code xung quanh: import tuyệt đối `src.`, settings qua `get_settings()`, node LangGraph là hàm async trả dict state từng phần, schema ở `src/models/`.
- Không thêm dependency mới nếu chưa nói với người dùng.

### R-07 — Đúng phạm vi
- Chỉ làm đúng việc được giao; không tự mở rộng tính năng, refactor lan rộng hay "dọn dẹp" ngoài yêu cầu.
- Không sửa `docs/guide/` (Technical Book, thuộc CODEOWNERS bên ngoài).
- Không làm tính năng nâng cao (E7) trước khi cổng cơ bản BL-30 đạt, trừ khi được yêu cầu.

### R-08 — Kiểm thử và báo cáo trung thực
- Báo kết quả ruff/pytest **thật**, kèm output khi có lỗi. Không nói "đã chạy/đã pass" nếu chưa chạy.
- Tính năng liên quan ACL/nguồn/HITL phải có ca phủ định, không chỉ happy path.
- Test và công việc phụ thuộc dataset được **hoãn tới khi có dataset thật**; ghi rõ là đang hoãn.
- Không ghi Done khi mới có mock/thiết kế.
- **Giai đoạn MVP (người dùng chốt 25/09/2026):** không viết unit test mới; thay vào đó bắt buộc chạy `ruff check`/`ruff format --check` và chạy thử CLI trên dữ liệu thật, báo output thật trong log. Xem `docs/plans/README.md` mục 0.

### R-09 — Dữ liệu thật, đặt tên rõ ràng
- Corpus dev phải là **sách/tài liệu thật, hợp pháp và miễn phí** (giấy phép mở hoặc tác giả phát hành); không sinh PDF giả.
- Lưu dưới `data/raw/books/<Tên môn>/<Tên sách>.pdf` (thư mục `data/` bị ignore); tên file chỉ là tên sách, không kèm mã.
- Nguồn gốc, giấy phép, checksum ghi trong manifest.

### R-10 — Nhật ký công việc sau mỗi bước
Sau **mỗi** bước, bất kể kết quả (thành công, một phần, thất bại, bị từ chối, bị hủy), viết log tiếng Việt `docs/work/NN_<chủ_đề>.md` gồm:
- Yêu cầu và mã BL/FR/BR liên quan
- File đã tạo/sửa/xóa
- Lệnh kiểm tra đã chạy và kết quả thật
- Việc còn lại, rủi ro, câu hỏi mở

### R-11 — Đánh giá và holdout
- Không dùng câu hỏi holdout, đáp án tham chiếu hay log kiểm chứng để tinh chỉnh prompt/retrieval trước khi báo kết quả vòng đó (BR-12).
- Không đổi rubric, mẫu số hay ngưỡng sau khi thấy điểm; không làm tròn dưới 80/100 thành đạt.
- Kết quả từ LLM mock không phải bằng chứng; LLM tự chấm không là bằng chứng duy nhất.

### R-12 — LLM
- Chỉ gọi LLM qua `src/services/llm.py::get_llm()`; không tự tạo client trong node/route.
- Cấu hình model/endpoint/key chỉ lấy từ `.env` qua `Settings`; không hard-code.
- Unit test phải mock LLM (fixture `mock_llm` trong `tests/conftest.py`); CI không được gọi LLM thật.

## 2. Cam kết của coding agent

Khi code trong repo này, tôi cam kết:

1. Đọc luật này và tài liệu liên quan trước khi sửa file.
2. Không bịa yêu cầu, kết quả, số liệu hay nguồn; điều chưa chắc thì hỏi.
3. Không commit, push hay chạy lệnh phá hủy khi chưa được đồng ý.
4. Không làm lộ secret hoặc dữ liệu nhạy cảm dưới bất kỳ hình thức nào.
5. Thực thi kiểm soát quyền ở server theo nguyên tắc mặc định từ chối.
6. Chạy ruff/pytest và báo đúng kết quả, kể cả khi thất bại.
7. Giữ thay đổi nhỏ, đúng phạm vi, dễ review.
8. Ghi log `docs/work/` sau mỗi bước, trả lời người dùng bằng tiếng Việt.

## 3. Checklist trước khi báo xong

- [ ] Thay đổi truy vết được về BL/FR/BR
- [ ] Không có secret/dữ liệu nhạy cảm trong diff
- [ ] `ruff check` + `ruff format --check` pass
- [ ] `pytest` đã chạy (hoặc ghi rõ lý do hoãn)
- [ ] Ca phủ định cho ACL/nguồn/HITL (nếu liên quan)
- [ ] Đã viết log `docs/work/NN_<chủ_đề>.md`
- [ ] Chưa commit/push nếu chưa được yêu cầu

## 4. Code theo plan

### R-13 — Có plan mới code
- Trước khi code một hạng mục của TV1, đọc `docs/plans/README.md` và file `UC-xx` tương ứng; làm đúng cấu trúc thư mục, interface và luật trong plan.
- Chỗ plan ghi "đề xuất", "cần chốt", "cần hỏi" hoặc có blocker → hỏi người dùng, không tự quyết.
- Plan mâu thuẫn PRD/backlog → PRD/backlog là chuẩn; báo người dùng để sửa plan.
- Việc không có trong plan nào → hỏi trước khi làm.
