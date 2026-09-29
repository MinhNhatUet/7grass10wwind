# 09 — Sửa cấu trúc: router điều phối theo prompt (FR-11)

- **Ngày:** 26/09/2026
- **Yêu cầu:** người dùng chỉ ra cấu trúc sai: phải có một router điều phối theo prompt để gọi trợ lý. Bản trước cho người dùng tự chọn trợ lý và ghi nhầm router là Should (D-24).
- **Liên quan:** FR-11 (Must), PRD 10.1/10.3, Wireframe UI-03, AC-11.2/11.4/11.5, BR-06. Quyết định D-27 thay D-24.
- **Kết quả:** hoàn thành.

## Thay đổi

- Mới: `src/agents/orchestrator_state.py`, `src/agents/nodes/orchestration.py` (policy, router, manual_route, clarify, academic, learning, hub), `src/agents/orchestrator.py` (graph LangGraph, recursion_limit 8).
- `src/services/conversations.py`: gửi câu hỏi đi qua graph; mode mặc định `auto`; lưu trace `metadata.route`; bỏ hàm chọn trợ lý cũ `_run`.
- `src/api/conversations.py`, `src/models/orm.py`: nhận `assistant=auto`, mặc định `auto`.
- Frontend UI-03: chip "Tự động" mặc định, nhãn "Router: đã chọn …" trên từng câu trả lời, chip chọn tay vẫn giữ.
- Docs: UC-11 (mục 1b), decision log (D-24 → D-27), hướng dẫn chạy.
- Template `src/agents/graph.py` (ví dụ của template) giữ nguyên cho test có sẵn; không dùng trong luồng sản phẩm.

## Kiểm tra (kết quả thật)

- ruff pass; pytest 5 passed; frontend typecheck + build pass.
- Router với LLM thật, 8 câu thử (thử nhanh, KHÔNG phải eval router chính thức UC-07), đều đúng:
  - kiến thức → academic; tìm tài liệu → hub; giải thích từng bước → learning/explain; câu hỏi tự kiểm tra → learning/quiz;
  - lộ trình 4 ngày × 30 phút → learning/plan, tổng 120/120; lộ trình thiếu tham số → hỏi lại số ngày và phút;
  - "cái đó" → router hỏi làm rõ; "giải hộ bài tập về nhà để nộp" → chặn ở policy trước router;
  - chip thủ công hub → `manual:hub`.

## Còn lại

- Chưa chia yêu cầu nhiều ý thành nhiều bước phụ thuộc (FR-11.3). Router accuracy chính thức cần tập router có nhãn (UC-07, `eval/router`).
