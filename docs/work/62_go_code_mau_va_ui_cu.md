# 62 — Gỡ code mẫu template và giao diện cũ (D-63)

## Yêu cầu
"cho 3 4 vào backup r xóa": bước 3 (gỡ endpoint/code mẫu của template) và bước 4 (gỡ trang và khung giao diện cũ), sao lưu trước khi xoá.

## Cách xác định file cần xoá
- Backend: tìm mọi chỗ tham chiếu `api.routes`, `agents.graph`, `agents.state`, `example_node`, `example_tool`, `ChatRequest` / `ChatResponse`. Chỉ có `main.py`, các test mẫu và chính các file mẫu dùng tới chúng; `eval/` dùng `eval.schemas` riêng.
- Frontend: dựng đồ thị import từ mọi `page.tsx` / `layout.tsx` còn giữ, tức trừ `/chat`, `/hub`, `/lecturer/*`. Những file không trang nào với tới được là các trang cũ và component chỉ chúng dùng. `ui/skeleton`, `ui/textarea`, `lib/utils` cũng không còn được import nhưng là thành phần UI dùng chung, không phải "trang cũ", nên giữ lại.
- Link sống duy nhất trỏ tới trang cũ: nút "Hỏi AI về tài liệu này" trong `source-reader.tsx` dẫn tới `/chat?document=`. Đổi sang `/?document=`; trang chat mới đã đọc tham số này, thư viện và manage-hub đang dùng sẵn.

## Sao lưu
`backup/removed_2026-10-02/` (gitignore) có 24 file, khoảng 195 KB. Bản lưu là bản hiện tại trên máy (kể cả phần sửa lint chưa commit), giữ nguyên cấu trúc thư mục, gồm cả `schemas.py` và `test_routes.py` bản trước khi sửa.

## Đã xoá (`git rm`)
- **Backend:** `src/api/routes.py`, `src/agents/graph.py`, `src/agents/state.py`, `src/agents/nodes/example_node.py`, `src/agents/tools/{__init__,example_tool}.py`, `tests/test_agents/{__init__,test_graph}.py`.
- **Frontend:**
  - trang: `app/chat/page.tsx`, `app/hub/page.tsx`, `app/lecturer/{dashboard,documents,review}/page.tsx`;
  - component: `components/{AppShell,CiteChip,SourceReader,StudyTools,VersionPreview,study-launcher}.tsx`, `components/layout/{AppShell,Sidebar}.tsx`, `components/useManagedCourse.ts`.

## Đã sửa
- `src/main.py`: bỏ import và mount router mẫu.
- `src/models/schemas.py`: bỏ `ChatRequest`, `ChatSource`, `ChatResponse`.
- `tests/test_api/test_routes.py`: giữ `test_health`; thay 2 test của endpoint mẫu bằng `test_template_chat_removed` (`/api/v1/chat` trả 404).
- `frontend/src/components/source-reader.tsx`: link `/chat?document=` thành `/?document=`.
- `CLAUDE.md`: phần Architecture mô tả orchestrator thật thay cho graph mẫu.
- `mo_ta_du_an_hien_tai.md`, `PRD_v2_MVP_edu04.md`: cập nhật OP-7, UX-4, số test, số cảnh báo lint.

## Kiểm tra
- `ruff check` / `ruff format --check src tests`: pass.
- `pytest`: **24 passed** (trước 27: bỏ 2 test graph mẫu và 2 test endpoint mẫu, thêm 1 test).
- `npm run build`: thành công, 14 route (bỏ `/chat`, `/hub`, `/lecturer/*`).
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 lỗi, 17 cảnh báo (trước 29).

## Lưu ý
- Hook ghi log AI (`scripts/log_hook.py`, `.claude/settings.json`) không bị đụng tới.
- Các thư mục rỗng còn lại trên máy (nếu có `__pycache__`) không ảnh hưởng git.
- Chưa commit.
