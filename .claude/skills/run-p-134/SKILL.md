---
name: run-p-134
description: Run, start, launch, drive, smoke-test or screenshot the EDU-04 / VAssistant app (FastAPI backend + Next.js frontend + Postgres) — log in as student/lecturer/admin, ask the academic assistant, take UI screenshots of any page (chat, library, learning plans, admin), call the API, or invoke backend services (academic, grounding, retrieval) in-process. Use when asked to run the app, check a change in the real UI, reproduce a chat answer, or screenshot a page.
---

# Run EDU-04 / VAssistant

Three processes: **Postgres** (Docker `edu04-db`, :5432), **backend** FastAPI (`uvicorn`, :8000),
**frontend** Next.js (`next dev`, :3000). The agent drives the running app with
`.claude/skills/run-p-134/driver.mjs` (Node + `playwright-core` already in repo `node_modules`,
headless Chromium) — `curl`-style API calls plus real-browser login/screenshot/chat.

All paths are relative to the repo root `D:\P-134`. Shell: **Git Bash** (see Gotchas — it mangles `/paths`).
Verified on Windows 11, Node 24, `.venv` = Python **3.12** (CLAUDE.md says 3.11; 3.12 works).

## Prerequisites (this checkout already has them)

Docker Desktop running, `.venv` with backend deps, `frontend/node_modules`, root `node_modules`
(e2e + playwright-core), and `.env` with `DEMO_LOGIN_ENABLED=true` and `DEMO_CNPM_*` accounts
(written by `scripts/seed_cnpm.py`). Re-sync Python deps (idempotent):

```bash
.venv/Scripts/python.exe -m pip install -q -r requirements.txt
```

## Is it already running? (check first — usually yes)

```bash
node .claude/skills/run-p-134/driver.mjs health
```
```
backend   200 http://localhost:8000/health
frontend  200 http://localhost:3000/login
postgres  healthy (edu04-db)
```
The user typically runs backend + frontend via `make dev` (two PowerShell windows, hot reload).
If all three are up, **don't start another copy** — just drive it. `next dev` on :3000 hot-reloads
frontend edits; uvicorn under `make dev` uses `--reload` for backend edits.

## Start (only what's down)

```bash
docker compose up -d db
.venv/Scripts/python.exe -m uvicorn src.main:app --host 127.0.0.1 --port 8000   # run_in_background (verified on :8001 — :8000 was taken)
cd frontend && npm run dev                                                         # run_in_background; :3000 (verified as `npm run dev -- -p 3001`)
```
First request to each Next route compiles it (~60 s for `/login` on a cold start); `health` waits up to 60 s.

**Second stack on other ports** (when the user's 8000/3000 are busy and you need *your* code running —
e.g. backend changes without `--reload`):
```bash
CORS_ORIGINS="http://localhost:3001" .venv/Scripts/python.exe -m uvicorn src.main:app --host 127.0.0.1 --port 8001   # background
```
Frontend: Next refuses a second `next dev` in `frontend/` ("Another next dev server is already running").
Copy it into the gitignored `scratch/` on the **same drive** and junction `node_modules` (PowerShell):
```powershell
robocopy D:\P-134\frontend D:\P-134\scratch\fe /E /XD node_modules .next /NFL /NDL /NJH /NJS /NP
New-Item -ItemType Junction -Path D:\P-134\scratch\fe\node_modules -Target D:\P-134\frontend\node_modules
Set-Content D:\P-134\scratch\fe\.env.local "NEXT_PUBLIC_API_URL=http://localhost:8001" -Encoding utf8
```
```bash
cd /d/P-134/scratch/fe && npm run dev -- -p 3001     # background
API_URL=http://localhost:8001 APP_URL=http://localhost:3001 node .claude/skills/run-p-134/driver.mjs health
```
Cleanup (remove the **junction first** with `rmdir`, never recurse-delete through it):
```powershell
cmd /c rmdir "D:\P-134\scratch\fe\node_modules"; Remove-Item -Recurse -Force "D:\P-134\scratch\fe"
```

## Drive it (agent path)

`node .claude/skills/run-p-134/driver.mjs <command>` — env `API_URL` / `APP_URL` pick the stack
(default :8000 / :3000). Screenshots go to `.claude/skills/run-p-134/shots/` (gitignored) unless `--out`.
**Open the PNG and look at it.**

```bash
D=.claude/skills/run-p-134/driver.mjs
node $D login lecturer                                  # prints a bearer token (student|lecturer|admin)
node $D api GET /me --role admin                        # raw API under /api/v1, prints status + JSON
node $D api GET "/learning/topics?course_id=SE101"
node $D ask "Kiểm thử hồi quy là gì?"                    # API chat: status, route steps, grounding counts, answer, citations
node $D shot /learning/plans                            # UI login as student → page → screenshot + <main> text
node $D shot /hub/manage --role lecturer
node $D shot /admin/costs --role admin --dark
node $D chat "Mô hình thác nước có những giai đoạn nào?" --out .claude/skills/run-p-134/shots/chat-waterfall.png
```
`ask` output looks like:
```
status:    answered
route:     ["policy:allow","router:academic@SE101","academic"]
grounding: {"proposed":1,"accepted":1,"removed":0}
Kiểm thử hồi quy là việc chạy lại toàn bộ bộ kiểm thử ... [1]
[1] 12_Tong quan Testing · {"type":"page","value":30,...}
```
Clarifying questions print `choices: [...]` (the buttons the UI shows). `chat` takes 15–30 s (LLM).

Pages worth knowing: student `/`, `/library`, `/learning`, `/learning/plans`; lecturer `/hub/manage`,
`/learning` (quiz builder); reviewer `/hub/review`; admin `/admin/management?tab=users|courses|documents|audit`,
`/admin/costs`, `/admin/monitoring`, `/admin/quota`. Demo data: course **SE101** (Công nghệ phần mềm) plus 7 others.

## Direct invocation (most PRs touch `src/services/`)

Call a service in-process against the real DB — no HTTP, no router. Run from repo root:
```bash
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe - <<'EOF'
from sqlalchemy import select
from src.config import get_settings
from src.db import get_sessionmaker
from src.models.orm import User
from src.services.assistants import academic

db = get_sessionmaker()()
student = db.scalar(select(User).where(User.login_id == get_settings().demo_cnpm_sinhvien_login))
r = academic.answer(db, student, "SE101", "Kiểm thử hộp đen là gì?", [], search_terms="black-box testing")
print(r.status, r.payload.get("grounding"))
print(r.content[:300])
EOF
```
This calls the real LLM/embeddings from `.env` (costs tokens). Same pattern works for `retrieval.search`,
`grounding.check_claims`, `learning_path.curriculum.load_curriculum`, `course_quiz` helpers.

## Test

```bash
APP_ENV=test OPENAI_API_KEY=test-key .venv/Scripts/python.exe -m pytest tests/ -q    # 235 passed, ~45 s, no real LLM
.venv/Scripts/python.exe -m ruff check src/ tests/
cd frontend && npx tsc --noEmit -p .
npx e2e run                                                                          # repo root; 13 agentic UI/API tests, ~1–2 min, needs app on :3000/:8000
```

## Gotchas

- **Git Bash rewrites args starting with `/`**: `node driver.mjs api GET /me` reached Node as
  `C:/Program Files/Git/me` → 404 while `curl` got 200. The driver strips that prefix (and accepts `me/courses`
  without a slash). Other tools: quote paths or drop the leading slash.
- **Git Bash heredocs eat backslashes** in Python patch scripts: `"\\n"` became a real newline, `r"\b"` became a
  backspace char (`^H`) in the written file. Write patch scripts with the Write tool (or use `chr(92)`) and grep
  the result with `cat -A`.
- **Python prints Vietnamese → `UnicodeEncodeError: 'charmap' (cp1258)`** → prefix `PYTHONIOENCODING=utf-8`.
- **Only one `next dev` per directory.** The copy must sit on the same drive under `D:\P-134` — a copy in
  `%TEMP%` (C:) failed: Turbopack `Symlink [project]/node_modules is invalid, it points out of the filesystem root`.
- **CORS**: backend allows only `CORS_ORIGINS` (default :3000). A frontend on :3001 needs the env override above.
  `frontend/.env.local` `NEXT_PUBLIC_API_URL` decides which backend the UI calls.
- **Admin has no demo button**; the driver logs in with `DEMO_CNPM_ADMIN_LOGIN/PASSWORD` from `.env` (never printed).
  In Playwright, `getByLabel('Mật khẩu')` also matches the "Hiện mật khẩu" eye button → use `#password` / `#email`.
- **Clicking "Đăng nhập" before hydration does nothing** under `next dev` (≈1 in 3 admin logins timed out in
  `waitForURL`, even with `waitUntil: 'commit'`). The driver first waits for the "Dùng thử" button (rendered only
  after hydrate + `/auth/demo-login` fetch), then clicks, and re-clicks once if the URL hasn't changed in 20 s → 8/8 OK.
- **No `chromium-cli`, and Playwright MCP fails** ("Chromium distribution 'chrome' is not found"). `playwright-core`
  1.63 in root `node_modules` launches `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1243` fine — that's what the driver uses.
- **Frontend Docker container is a stale prod build** (`node server.js`, no source mount): edits don't show there.
  Check what owns :3000 (`netstat -ano | grep :3000`) before trusting a screenshot.
- **e2e agent model**: Copilot rejected `claude-sonnet-5` and `gpt-6-luna` ("The requested model is not supported");
  `e2e.config.ts` uses `copilot('gpt-4.1')`. e2e tests leave data: drafts `E2E …`, locked `e2e_reviewer_*`, `e2e_sv_*` users.
- **Chat input placeholder** is `Hỏi EDU-04 hoặc bắt đầu bằng câu hỏi học thuật...` (changed by the UI redesign merge);
  answer is done when a `button[aria-label^="Nguồn"]`, the `Lựa chọn` button group, or `button[title="Hữu ích"]` appears.
- **Windows PowerShell 5.1 + junctions**: remove a junction with `cmd /c rmdir <junction>` before deleting its parent.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `frontend DOWN … ECONNREFUSED` right after start | Next still compiling; rerun `health` (first `/login` took 57 s). |
| `⨯ Another next dev server is already running` | Use the existing :3000, or the scratch-copy recipe above. |
| `Symlink [project]/node_modules is invalid, it points out of the filesystem root` | Scratch copy is on another drive — put it under `D:\P-134\scratch\`. |
| UI fix "doesn't work" on :3000 | :3000 was the Docker prod container (stale build) — stop it and run `cd frontend && npm run dev`. |
| `api GET /x` returns 404 but `curl` works | Git Bash path mangling — the driver strips it; elsewhere drop the leading slash. |
| `strict mode violation: getByLabel('Mật khẩu') resolved to 2 elements` | Use `#password` (eye button shares the label text). |
| `model provider failed: The requested model is not supported` (e2e) | Pick an enabled Copilot model (`npx e2e models github-copilot`); `gpt-4.1` works. |
