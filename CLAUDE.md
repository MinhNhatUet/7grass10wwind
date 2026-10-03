# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Before creating or changing any file, read `docs/rules/coding_agent_rules.md`** (local only, gitignored). It is authoritative: R-01…R-12 plus agent commitments — no commit/push unless asked, BR rules server-side default-deny, LLM only via `get_llm()`, Vietnamese work log in `/docs/work/NN_<topic>.md` after every step. If the file is missing, ask the user. For TV1 work (BL-01/02/03/27/28/30/36/40), also read `docs/plans/README.md` and the matching `docs/plans/UC-xx_*.md` (local only) and follow its folder structure and interfaces; anything marked "đề xuất/cần chốt" must be confirmed with the user first.

## Project

Team repo for EDU-04 "Kho tri thức hỗ trợ học thuật X" (AI20K Build Phase, team "7 cỏ 10 gió"), created from the AI20K Agent Template. The product is an academic RAG assistant built from three parts: Academic Assistant (Q&A that cites its sources), Learning Assistant (explanations and study plans) and Knowledge Hub. It also has a lecturer document workflow: upload → approve → publish → revoke. The code in `src/` is still mostly the template skeleton. Product requirements live in `docs/documentions/`:

- `PRD_edu04.md`: functional requirements (FR-xx) and the mandatory business rules BR-01…BR-13 in §5.2
- `backlog_edu04.md`: backlog items BL-xx grouped into epics E1–E7
- `brief_edu04.md`, `milestone_01_edu04.md`, `wireframe&UIflow_edu04.md`

When you work on product features, cite the BL/FR/BR IDs they relate to. Enforce the BR rules on the server. Key examples: never trust a role or user_id sent by the client (BR-02). Filter by ACL before retrieval and check it again before the LLM call and before the answer goes out (BR-03). Every academic claim needs a citation (BR-04). Never output full solutions to assignments (BR-06). Treat document content as data, never as instructions (BR-09).

`docs/guide/` is the template's Technical Guidebook. It is synced upstream and owned by an external CODEOWNERS team, so do not edit it for project work.

## Commands

Python 3.11. Setup: `python3.11 -m venv .venv`, activate it, run `pip install -r requirements.txt`, then `cp .env.example .env`.

```bash
make run                    # uvicorn src.main:app --reload on :8000 (health: GET /health)
make test                   # pytest tests/ -v
make lint                   # ruff check src/ tests/
make format                 # ruff format src/ tests/
pytest tests/test_api/test_routes.py::test_health -v   # single test
docker compose up --build   # containerised backend
```

CI (`.github/workflows/ci.yml`) runs `ruff check src/ tests/` and `pytest tests/ -v --tb=short` with `APP_ENV=test` and `OPENAI_API_KEY=test-key`. It triggers on pushes to `main`/`develop` and on PRs into them. Ruff config is in `ruff.toml`: line length 120, rules E/F/I/N/W/UP, E501 ignored.

## Architecture

Layered FastAPI + LangGraph backend. All imports are absolute from the `src.` package.

- `src/main.py`: creates the FastAPI app with CORS (origins come from the comma-separated `CORS_ORIGINS`), mounts the product routers in `src/api/` (auth, conversations, documents, sources, dashboard, admin, quizzes) under `/api/v1`, and exposes `/health`. The template sample (`POST /api/v1/chat`, `agents/graph.py`, example node/tool) was removed (D-63); chat goes through `POST /api/v1/conversations/{id}/messages`.
- `src/agents/`: LangGraph orchestrator (`orchestrator.py`, `orchestrator_state.py`, `nodes/orchestration.py`): policy → router (picks course + assistant) → academic | learning | hub | clarify. Assistants live in `src/services/assistants/`.
- `src/services/llm.py`: `get_llm()` builds a `ChatOpenAI` from settings. Obtain the LLM through this function instead of constructing clients inside nodes.
- `src/config.py`: pydantic-settings `Settings`, read from `.env` and cached by `get_settings()` (`lru_cache`). Settings changes do not take effect until the process restarts or the cache is cleared.
- Tests: `tests/conftest.py` provides an httpx `AsyncClient` over `ASGITransport(app=app)` (`client` fixture) and a `mock_llm` fixture. Async tests use `@pytest.mark.asyncio`. Tests must not call the real LLM.

## Repo conventions

- Branches (`.github/BRANCHING.md`): `main` is the stable delivery branch. Name feature branches after backlog items, for example `feat/BL-16-knowledge-hub`, `fix/BL-06-course-access` or `docs/BL-01-project-scope`. Keep one reviewable change per PR and use the templates in `.github/`. Stage files selectively; do not run `git add .`.
- AI usage logging: every prompt is logged to `.ai-log/session.jsonl` by hooks (`.claude/settings.json` → `scripts/log_hook.py`) and submitted to the grading server on `git push`. Do not remove or bypass these hooks.
- Never commit `.env`, private or restricted data, or holdout evaluation data (BR-12). The repo may contain only manifests, schemas and checksums for restricted datasets.
- Demo Day deliverables live in `README.md`, `ARCHITECTURE.md`/`docs/architecture_diagram.md`, `JOURNAL.md`, `WORKLOG.md`, `eval/` and `presentation/`.
