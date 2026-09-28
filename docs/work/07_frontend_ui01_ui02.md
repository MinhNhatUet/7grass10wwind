# 07 — Frontend Next.js (UI-01, UI-02) và hướng dẫn chạy

- **Ngày:** 25/09/2026 · **Nhánh:** `feat/BL-03-tv1-eval-mvp` (chưa commit)
- **Yêu cầu:** "tạo front end và hướng dẫn chạy". Người dùng chọn Next.js, phạm vi UI-01 + UI-02.
- **Liên quan:** BL-07 (owner gốc **TV4**, cần báo); UI-01, UI-02; FR-01.1/01.2/01.3; BR-02. Quyết định D-19. Plan UC-10.
- **Kết quả:** hoàn thành. Build pass, API chạy qua proxy thật. **Chưa thử được bằng trình duyệt** (máy không có Chrome cho Playwright).

## File

- `frontend/`: package.json (next 16.3.6, react 19.3.0, typescript 5.9.3), next.config.ts (rewrite `/api/*` → `BACKEND_URL`), tsconfig.json, .env.example, `src/app/{layout,page,login/page,courses/page}.tsx`, `globals.css` (responsive, breakpoint 768px), `src/lib/{api,session,messages}.ts`.
- `docs/handover/huong_dan_chay.md`: hướng dẫn chạy backend + frontend, bảng tài khoản, giới hạn, sự cố thường gặp.
- `docs/plans/UC-10_*.md`, `docs/plans/README.md`, `docs/decisions/decision_log.md` (D-19).

## Kiểm tra (kết quả thật)

- `npm install`: 27 gói. `npm run typecheck`: pass. `npm run build`: pass, 4 route tĩnh (`/`, `/login`, `/courses`, `/_not-found`).
- Chạy backend (uvicorn :8000) + frontend (`next start` :3000): `/health` 200, `/login` 200. Gọi `POST http://127.0.0.1:3000/api/v1/auth/login` với tài khoản sai → nhận đúng `{"status":"error","error":{"code":"INVALID_CREDENTIALS"...}}` qua proxy.
- Kiểm tra UI bằng Playwright: **không chạy được**, vì thiếu Chrome (`chrome.exe` không có). Không tự cài trình duyệt.
- node_modules, .next, .env.local bị gitignore.

## Còn lại

- Người dùng mở http://localhost:3000 để kiểm tra giao diện bằng mắt, hoặc cài Chrome/Playwright để tự động hóa.
- Báo TV4 (BL-07): khung này nên được giữ contract API và microcopy theo wireframe.
- UI-03 trở đi chờ API hội thoại/tài liệu.
