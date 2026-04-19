# Backend `/api` prefix implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every backend HTTP path under a uniform `/api` prefix so the Vite dev proxy and Caddy reverse proxy can match a single glob instead of enumerating top-level roots.

**Architecture:** Attach `/api` once at the aggregate seam in `backend/src/klassenzeit_backend/main.py` via `include_router(..., prefix="/api")`, plus FastAPI's `openapi_url` / `docs_url` / `redoc_url` kwargs. Leaf routers keep their semantic prefixes. Testing router (`/__test__/*`) is explicitly not moved. Backend tests, frontend hooks and proxy, MSW handlers, staging compose healthcheck, and documentation follow mechanically.

**Tech Stack:** FastAPI, pytest + httpx AsyncClient, TypeScript + openapi-fetch, MSW, Vite, Playwright, Docker compose + Caddy.

Spec: `docs/superpowers/specs/2026-04-19-backend-api-prefix-design.md`.

---

## Task 1: Backend router under `/api`

**Subagent prompt to include:** the task heading and all steps below, the spec path above, and the reminder that commits happen in the main session, not the subagent.

**Files:**
- Modify: `backend/src/klassenzeit_backend/main.py`
- Modify: `backend/tests/test_health.py`
- Modify: `backend/tests/conftest.py:219` (the `login_as` helper literal)
- Modify: `backend/tests/testing/test_router.py:33, 43` (`/subjects` inside the testing-router integration test)
- Modify: `backend/tests/auth/test_admin.py`
- Modify: `backend/tests/auth/test_dependencies.py`
- Modify: `backend/tests/auth/test_login.py`
- Modify: `backend/tests/auth/test_me.py`
- Modify: `backend/tests/scheduling/test_lessons.py`
- Modify: `backend/tests/scheduling/test_rooms.py`
- Modify: `backend/tests/scheduling/test_school_classes.py`
- Modify: `backend/tests/scheduling/test_stundentafeln.py`
- Modify: `backend/tests/scheduling/test_subjects.py`
- Modify: `backend/tests/scheduling/test_teachers.py`
- Modify: `backend/tests/scheduling/test_week_schemes.py`

Context the subagent needs: the existing `main.py` looks like this today (abbreviated):

```python
app = FastAPI(title="Klassenzeit", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(scheduling_router)

include_testing_router_if_enabled(app, os.environ.get("KZ_ENV"))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
```

- [ ] **Step 1: Write the failing red test pair**

Replace the contents of `backend/tests/test_health.py` with:

```python
"""Tests for the /api/health endpoint.

Verifies the full stack: FastAPI routing + async client + real call into
the klassenzeit_solver PyO3 binding. The solver is not mocked.
"""

from httpx import ASGITransport, AsyncClient

from klassenzeit_backend.main import app


async def test_health_returns_ok_and_exercises_solver() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "solver_check": "ko"}


async def test_health_not_at_root() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 404
```

- [ ] **Step 2: Run the health tests and confirm they fail**

```bash
uv run pytest backend/tests/test_health.py -v
```

Expected: both `test_health_returns_ok_and_exercises_solver` and `test_health_not_at_root` fail. The first fails with 404 on `/api/health`; the second fails because `/health` currently returns 200.

- [ ] **Step 3: Update `main.py` to mount everything under `/api`**

Replace the whole file `backend/src/klassenzeit_backend/main.py` with:

```python
"""FastAPI entry point for the Klassenzeit backend.

The ``lifespan`` context manager owns the async engine, session factory,
settings, and rate limiter. They live on ``app.state`` rather than as
module-level globals so tests can override them.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.routes import auth_router
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.engine import build_engine
from klassenzeit_backend.scheduling.routes import scheduling_router
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled
from klassenzeit_solver import reverse_chars


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage app lifecycle: initialize shared state on startup, dispose engine on shutdown."""
    settings = get_settings()
    engine = build_engine()
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    app.state.rate_limiter = LoginRateLimiter(
        max_attempts=settings.login_max_attempts,
        lockout_minutes=settings.login_lockout_minutes,
    )
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(
    title="Klassenzeit",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def health() -> dict[str, str]:
    """Return a simple health-check response with a solver smoke test."""
    return {"status": "ok", "solver_check": reverse_chars("ok")}


app.include_router(auth_router, prefix="/api")
app.include_router(scheduling_router, prefix="/api")
app.include_router(health_router, prefix="/api")

# Routing decisions happen at import time. Reading ``KZ_ENV`` directly from
# ``os.environ`` avoids constructing a full ``Settings`` at module load: the
# ``dump_openapi`` script and CI type regeneration import this module without
# a ``KZ_DATABASE_URL`` available. The runtime check here only needs the env
# name, so the lighter dependency is appropriate.

include_testing_router_if_enabled(app, os.environ.get("KZ_ENV"))
```

- [ ] **Step 4: Run the health tests again to confirm green**

```bash
uv run pytest backend/tests/test_health.py -v
```

Expected: both tests pass.

- [ ] **Step 5: Bulk-rewrite every backend test path literal**

From the repo root:

```bash
python - <<'PY'
import re
from pathlib import Path

PREFIXES = ("auth", "subjects", "rooms", "teachers", "week-schemes",
            "stundentafeln", "classes", "lessons", "health")

pattern = re.compile(rf'(f?")/({"|".join(PREFIXES)})(?=[/"?])')

for path in Path("backend/tests").rglob("*.py"):
    text = path.read_text()
    new_text = pattern.sub(lambda m: f'{m.group(1)}/api/{m.group(2)}', text)
    if new_text != text:
        path.write_text(new_text)
        print(f"updated {path}")
PY
```

The `(?=[/"?])` lookahead is important: it only rewrites paths that are followed by `/`, `"`, or `?` (for query-string use), so bare string tokens like `"auth"` or `"health"` as dict keys are not touched.

- [ ] **Step 6: Verify the rewrite touched only intended paths**

```bash
# No raw root-level paths remain in backend tests.
grep -rnE '"/(auth|subjects|rooms|teachers|week-schemes|stundentafeln|classes|lessons|health)[/"?]' backend/tests \
  | grep -v '/api/' \
  | grep -v '/__test__/'
```

Expected output: empty. Any match that slips through must be investigated (likely a `/health` inside a docstring or comment).

```bash
# Spot-check the expected post-state.
grep -c '"/api/' backend/tests/conftest.py            # expected: 1
grep -c '"/api/auth' backend/tests/auth/test_login.py # expected: >0
grep -c '/__test__/' backend/tests/testing/test_router.py # expected: 2 (both __test__ calls)
```

- [ ] **Step 7: Run the full Python test suite**

```bash
uv run pytest -q
```

Expected: all tests pass.

- [ ] **Step 8: Run Python lint**

```bash
uv run ruff check
uv run ruff format --check
uv run ty check
uv run vulture backend/src
uv run python scripts/check_unique_fns.py
```

Expected: all pass.

- [ ] **Step 9: Commit**

Main session runs:

```bash
git add backend/src/klassenzeit_backend/main.py backend/tests
git commit -m "refactor(backend): mount API under /api prefix"
```

---

## Task 2: Frontend migration to `/api`

**Subagent prompt to include:** the task heading and all steps below, plus a note that the backend commit from Task 1 is already applied on this branch.

**Files:**
- Regenerate: `frontend/src/lib/api-types.ts` (gitignored, not committed)
- Modify: `frontend/src/features/school-classes/hooks.ts`
- Modify: `frontend/src/features/stundentafeln/hooks.ts`
- Modify: `frontend/src/features/rooms/hooks.ts`
- Modify: `frontend/src/features/subjects/hooks.ts`
- Modify: `frontend/src/features/teachers/hooks.ts`
- Modify: `frontend/src/features/week-schemes/hooks.ts`
- Modify: `frontend/src/routes/login.tsx`
- Modify: `frontend/src/lib/auth.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1: Regenerate OpenAPI types from the new backend**

```bash
mise run fe:types
```

Expected: `frontend/src/lib/api-types.ts` is regenerated. Path keys now start with `/api/...`. The file is gitignored.

Spot check:

```bash
grep -c '"/api/' frontend/openapi.json            # expected: many
grep -c '"/auth/' frontend/openapi.json           # expected: 0
grep -c '"/subjects' frontend/openapi.json        # expected: 0 (now /api/subjects)
```

- [ ] **Step 2: Rewrite the 24 `client.METHOD(...)` call sites**

From the repo root:

```bash
python - <<'PY'
import re
from pathlib import Path

files = [
    "frontend/src/features/school-classes/hooks.ts",
    "frontend/src/features/stundentafeln/hooks.ts",
    "frontend/src/features/rooms/hooks.ts",
    "frontend/src/features/subjects/hooks.ts",
    "frontend/src/features/teachers/hooks.ts",
    "frontend/src/features/week-schemes/hooks.ts",
    "frontend/src/routes/login.tsx",
    "frontend/src/lib/auth.ts",
]

pattern = re.compile(r'(client\.(?:GET|POST|PATCH|DELETE|PUT)\(")(/(?:auth|subjects|rooms|teachers|week-schemes|stundentafeln|classes|lessons)(?:/[^"]*)?)(")')

for p in files:
    path = Path(p)
    text = path.read_text()
    new_text = pattern.sub(lambda m: f"{m.group(1)}/api{m.group(2)}{m.group(3)}", text)
    if new_text != text:
        path.write_text(new_text)
        print(f"updated {p}")
PY
```

- [ ] **Step 3: Verify call-site rewrite**

```bash
grep -rnE 'client\.(GET|POST|PATCH|DELETE|PUT)\("/[^a]' frontend/src
```

Expected: empty (every match should start with `/api/`, and the `[^a]` excludes that).

```bash
grep -rnE 'client\.(GET|POST|PATCH|DELETE|PUT)' frontend/src | wc -l
```

Expected: 24 (unchanged from pre-refactor count).

- [ ] **Step 4: Collapse the Vite proxy**

Replace the contents of `frontend/vite.config.ts` with:

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND = "http://localhost:8000";

export default defineConfig({
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
});
```

- [ ] **Step 5: Rewrite MSW handler URLs**

Update `frontend/tests/msw-handlers.ts` so every `http.<method>(` call uses the new path. Edit each line in turn (all 14 below):

```ts
  http.get(`${BASE}/api/auth/me`, () => HttpResponse.json(adminMe)),
  http.post(`${BASE}/api/auth/login`, async () => HttpResponse.json(null, { status: 204 })),
  http.post(`${BASE}/api/auth/logout`, () => HttpResponse.json(null, { status: 204 })),
  http.get(`${BASE}/api/subjects`, () => HttpResponse.json(initialSubjects)),
  http.post(`${BASE}/api/subjects`, async ({ request }) => {
    // body unchanged
  }),
  http.get(`${BASE}/api/rooms`, () => HttpResponse.json(initialRooms)),
  http.post(`${BASE}/api/rooms`, async ({ request }) => {
    // body unchanged
  }),
  http.get(`${BASE}/api/teachers`, () => HttpResponse.json(initialTeachers)),
  http.post(`${BASE}/api/teachers`, async ({ request }) => {
    // body unchanged
  }),
  http.get(`${BASE}/api/week-schemes`, () => HttpResponse.json(initialWeekSchemes)),
  http.post(`${BASE}/api/week-schemes`, async ({ request }) => {
    // body unchanged
  }),
  http.get(`${BASE}/api/stundentafeln`, () => HttpResponse.json(initialStundentafeln)),
  http.get(`${BASE}/api/classes`, () => HttpResponse.json(initialSchoolClasses)),
  http.post(`${BASE}/api/classes`, async ({ request }) => {
    // body unchanged
  }),
```

Either hand-edit each call or run the same Python regex as in Step 2 scoped to this file. A pure sed also works:

```bash
sed -i -E 's|(\$\{BASE\})/(auth\|subjects\|rooms\|teachers\|week-schemes\|stundentafeln\|classes\|lessons\|health)|\1/api/\2|g' frontend/tests/msw-handlers.ts
```

Verify:

```bash
grep -c '/api/' frontend/tests/msw-handlers.ts    # expected: 14
grep -cE '\$\{BASE\}/(auth|subjects|rooms|teachers|week-schemes|stundentafeln|classes)[^/]' frontend/tests/msw-handlers.ts  # expected: 0
```

- [ ] **Step 6: Run frontend tests**

```bash
mise run fe:test
```

Expected: all tests pass.

- [ ] **Step 7: Run frontend lint + build**

```bash
mise run fe:lint
mise run fe:build
```

Expected: both pass. The build is included because CI's type check runs on the post-build route tree, and the new paths must flow through.

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/vite.config.ts frontend/tests
git commit -m "refactor(frontend): migrate api client and proxy to /api prefix"
```

Note: `frontend/src/lib/api-types.ts` is gitignored, so it does not appear in the commit. The build step regenerates it in CI.

---

## Task 3: Deploy compose and runbook

**Subagent prompt to include:** the task heading and all steps below.

**Files:**
- Modify: `deploy/compose.yaml` (healthcheck URL)
- Modify: `deploy/README.md` (first-deploy curl example + follow-up note)

- [ ] **Step 1: Update the backend healthcheck URL in `deploy/compose.yaml`**

Find the block:

```yaml
    healthcheck:
      test:
        - "CMD-SHELL"
        - "python -c 'import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(\"http://127.0.0.1:3001/health\").status == 200 else 1)'"
```

Change to:

```yaml
    healthcheck:
      test:
        - "CMD-SHELL"
        - "python -c 'import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(\"http://127.0.0.1:3001/api/health\").status == 200 else 1)'"
```

- [ ] **Step 2: Update the `deploy/README.md` curl example**

Find:

```
   curl -fsS https://klassenzeit-staging.pascalkraus.com/health
   # expected: {"status":"ok","solver_check":"ko"}
```

Change to:

```
   curl -fsS https://klassenzeit-staging.pascalkraus.com/api/health
   # expected: {"status":"ok","solver_check":"ko"}
```

- [ ] **Step 3: Append a follow-up note to `deploy/README.md`**

Under the first-time setup section, after the existing `First deploy` block, add:

```markdown
### Coordinating with `server-infra`

The shared Caddyfile in `~/Code/server-infra/Caddyfile` currently uses a
temporary `path_regexp` matcher enumerating each top-level backend segment
(`/auth/*`, `/subjects`, etc.). After this PR lands, that matcher can be
reverted to the clean `handle /api/* { reverse_proxy klassenzeit-backend-staging:3001 }`
pattern. The temporary matcher still routes `/api/*` correctly in the
interim because it includes every path the backend now serves.
```

- [ ] **Step 4: Commit**

```bash
git add deploy/compose.yaml deploy/README.md
git commit -m "build(deploy): hit /api/health in staging compose and runbook"
```

---

## Task 4: Docs and ADR

**Subagent prompt to include:** the task heading and all steps below.

**Files:**
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/authentication.md`
- Create: `docs/adr/0010-api-prefix.md`
- Modify: `docs/adr/README.md` (add ADR 0010 to the index)
- Modify: `docs/superpowers/OPEN_THINGS.md` (remove two resolved entries)

- [ ] **Step 1: Update `docs/architecture/overview.md`**

Find:

```
- **HTTP API** (`backend/src/klassenzeit_backend/main.py`, growing) —
  FastAPI app. Currently only `/health` exists.
```

Replace with:

```
- **HTTP API** (`backend/src/klassenzeit_backend/main.py`, growing) —
  FastAPI app. Routes are mounted under `/api/*` (see ADR 0010);
  `/api/health` is the liveness probe.
```

- [ ] **Step 2: Update `docs/architecture/authentication.md`**

Replace every occurrence of `/auth/` with `/api/auth/` inside the document. Run:

```bash
sed -i 's|POST /auth/|POST /api/auth/|g; s|GET /auth/|GET /api/auth/|g; s|`/auth/|`/api/auth/|g' docs/architecture/authentication.md
```

Verify:

```bash
grep -n '/api/auth/' docs/architecture/authentication.md  # expected: matches
grep -n '/auth/' docs/architecture/authentication.md | grep -v '/api/' # expected: empty
```

- [ ] **Step 3: Create `docs/adr/0010-api-prefix.md`**

Write exactly:

```markdown
# 0010: Uniform `/api` prefix on the backend

- **Status:** Accepted
- **Date:** 2026-04-19

## Context

The FastAPI app used to mount its routers at the root: `/auth/*`, `/subjects`,
`/teachers`, `/rooms`, `/week-schemes`, `/stundentafeln`, `/classes`, `/lessons`,
`/health`, `/openapi.json`, `/docs`, `/redoc`. Any reverse proxy (Vite in dev,
Caddy in staging) had to enumerate every top-level segment to split API traffic
from SPA traffic. The staging deploy shipped in PR #88 regressed because the
default `/api/*` matcher routed nothing, and the SPA fell back to `index.html`
on every backend call. A temporary `path_regexp` matcher on the VPS enumerated
each segment by hand to unblock the deploy.

## Decision

Mount every backend HTTP path under a single `/api` prefix: `/api/auth/*`,
`/api/subjects`, `/api/teachers`, `/api/rooms`, `/api/week-schemes`,
`/api/stundentafeln`, `/api/classes`, `/api/lessons`, plus `/api/health`,
`/api/openapi.json`, `/api/docs`, and `/api/redoc`. The `/__test__/*` router
stays at root because it is an internal Playwright readiness surface that
must never flow through the public `/api/*` path.

## Alternatives considered

- **`app.mount("/api", sub_app)`:** A sub-application has its own OpenAPI
  schema and bypasses parent middleware. The type-generation pipeline dumps
  the parent app's schema, which would miss every mounted route. Rejected.
- **Add `/api` to every leaf router prefix:** Duplicates the literal across
  eight modules and makes a future prefix change a sweep. Rejected.
- **Dual-mount old and new paths for one release:** No external API consumer
  exists, so the transition cost buys nothing. Rejected.

## Consequences

- Reverse proxies (Vite dev, Caddy) match one glob. Adding a new backend
  route no longer requires a proxy change.
- The Caddyfile in `~/Code/server-infra` can revert from its temporary
  `path_regexp` matcher back to `handle /api/* { reverse_proxy ... }`.
- Existing documentation that references unprefixed paths is inaccurate; the
  architecture and authentication docs now show the prefix.
- `mise run fe:types` regenerates the frontend OpenAPI client from the new
  schema; all `client.METHOD("/...")` call sites updated accordingly.
- The staging compose healthcheck now curls `/api/health` internally.
```

- [ ] **Step 4: Register the ADR in the index**

Modify `docs/adr/README.md` by appending a row under the existing table:

```markdown
| 0010 | [Uniform `/api` prefix on the backend](0010-api-prefix.md) | Accepted |
```

- [ ] **Step 5: Prune resolved entries from `docs/superpowers/OPEN_THINGS.md`**

Remove the bullet that begins `- **Uniform \`/api\` prefix on the backend.**` (the entire multi-line bullet, which currently lives under `## Product capabilities` at the "Uniform `/api` prefix on the backend." marker).

Remove the bullet under `### E2E (Playwright)` that begins:

```
- **Direct navigation to `/subjects` (or other `API_PREFIXES` paths) collides with the Vite preview proxy.**
```

(the entire multi-line bullet).

Do not touch any other entry.

Verify:

```bash
grep -c 'Uniform `/api` prefix' docs/superpowers/OPEN_THINGS.md  # expected: 0
grep -c 'API_PREFIXES' docs/superpowers/OPEN_THINGS.md           # expected: 0
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/overview.md docs/architecture/authentication.md docs/adr/0010-api-prefix.md docs/adr/README.md docs/superpowers/OPEN_THINGS.md
git commit -m "docs: document uniform /api prefix and retire related open items"
```

---

## Task 5: Final green lap

**Subagent prompt to include:** the task heading and all steps below.

- [ ] **Step 1: Full test suite**

```bash
mise run test
```

Expected: Rust, Python, and frontend tests all green.

- [ ] **Step 2: Full lint**

```bash
mise run lint
```

Expected: all pass.

- [ ] **Step 3: Manual smoke check with the dev server**

```bash
uv run uvicorn klassenzeit_backend.main:app --port 8000 &
UVICORN_PID=$!
sleep 2
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/health   # expected: 200
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8000/health       # expected: 404
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/openapi.json # expected: 200
kill "$UVICORN_PID"
```

Expected: 200, 404, 200.

If `mise run test` is green but the smoke check fails, capture the failure and inspect `main.py` rather than skipping the check.

- [ ] **Step 4: No commit**

This is a verification-only task. No new commit; the work lands via Tasks 1-4.

---

## Self-review checklist (verified at plan-writing time)

- **Spec coverage:** Task 1 covers router mount, `/health` move, OpenAPI kwargs, and every backend test literal. Task 2 covers the frontend regeneration, 24 hook call sites, Vite proxy, and MSW handlers. Task 3 covers the compose healthcheck and runbook. Task 4 covers architecture overview, authentication doc, ADR 0010, and the two OPEN_THINGS entries. Task 5 verifies end-to-end. Goals and non-goals from the spec are reflected; `/__test__/*` is explicitly not touched.
- **No placeholders.** Every step has the concrete command or code.
- **Type consistency.** The new router name `health_router` is introduced in Task 1 Step 3 and not referenced elsewhere. `api-types.ts` path updates flow through the openapi-fetch generics, which update transparently once the schema changes. The MSW `BASE` constant is unchanged.
- **Conventional Commits.** `refactor(backend)`, `refactor(frontend)`, `build(deploy)`, `docs` — all valid types with scopes matching the directory they touch.
