# Uniform `/api` prefix on the backend

Spec date: 2026-04-19
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` has had an entry for this refactor since the staging
deployment landed in PR #88. The problem: the FastAPI app mounts its routers at the
root (`/auth/*`, `/subjects`, `/teachers`, `/rooms`, `/week-schemes`, `/stundentafeln`,
`/classes`, `/lessons`, `/health`, `/openapi.json`, `/docs`, `/redoc`) and the reverse
proxy has to enumerate each top-level prefix to split API traffic from SPA traffic.
PR #88 bit this when the staging Caddyfile's default `/api/*` matcher routed nothing
useful, and the SPA fell back to `index.html` on `/health` and every other backend
path. A temporary `path_regexp` matcher on the VPS currently enumerates every
backend segment by hand.

Every new entity route has to be added to three lists today: the FastAPI leaf router,
the Vite dev proxy (`frontend/vite.config.ts`), and the Caddy matcher in `server-infra`.
Pulling the entire backend under a single `/api/*` prefix collapses all three to one
glob and removes that maintenance tax.

## Goals

- Every backend-served HTTP path is reachable only under `/api/*`:
  - `/api/auth/*` (login, logout, me, change-password, admin user management)
  - `/api/subjects`, `/api/rooms`, `/api/teachers`, `/api/week-schemes`,
    `/api/stundentafeln`, `/api/classes`, `/api/lessons`
  - `/api/classes/{class_id}/generate-lessons`
  - `/api/health`
  - `/api/openapi.json`, `/api/docs`, `/api/redoc`
- `GET /health`, `GET /subjects`, `GET /auth/me`, etc. return 404 after the refactor.
- Backend test suite green: every `client.get("/auth/login")` style literal updated
  to the new path.
- Frontend type generation regenerates against the new schema and every
  `client.METHOD(...)` call site in the SPA points at the new path.
- Vite proxy collapses to a single `/api` rule.
- MSW handlers in `frontend/tests/msw-handlers.ts` move to the new paths.
- Staging `deploy/compose.yaml` backend healthcheck hits `/api/health`.
- Documentation: architecture overview, authentication doc, an ADR capturing the
  decision, and the OPEN_THINGS entry retired.

## Non-goals

- **`/__test__/*` is untouched.** The testing router stays at root. It is mounted only
  when `KZ_ENV == "test"` and is internal to Playwright's readiness probe; moving it
  under `/api` would add noise without a Caddy benefit.
- **No backwards compatibility.** No transitional dual-mount or redirect middleware.
  The only live clients (this repo's frontend and the staging deploy's healthcheck)
  ship in the same PR.
- **No shared `API_PREFIX` constant.** `/api` is referenced by `main.py`,
  `deploy/compose.yaml`, and a couple of docs; a constant does not earn its keep.
- **No `server-infra` changes in this PR.** The Caddy temporary matcher revert happens
  in that repo. This PR documents the follow-up in its body and in `deploy/README.md`.
- **No runtime reconfiguration.** `/api` is the prefix, hardcoded in `main.py`.
- **No disabling of `/docs` and `/redoc` in prod.** Out of scope.
- **Frontend route URLs stay as-is.** `/subjects`, `/rooms`, etc. are SPA routes
  rendered by TanStack Router; they are unrelated to the API surface and remain.

## Stack (unchanged)

- Backend: FastAPI 0.116+, SQLAlchemy async, pytest with httpx `AsyncClient`.
- Frontend: Vite 7 + React 19, `openapi-fetch`, MSW for test network, Playwright
  for e2e.
- Deploy: `deploy/compose.yaml` on the external `web` Docker network behind Caddy.

## Architecture

### Router mount

```python
# backend/src/klassenzeit_backend/main.py
app = FastAPI(
    title="Klassenzeit",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)
app.include_router(auth_router, prefix="/api")
app.include_router(scheduling_router, prefix="/api")
app.include_router(health_router, prefix="/api")

include_testing_router_if_enabled(app, os.environ.get("KZ_ENV"))
```

- Leaf routers (`/auth`, `/subjects`, `/rooms`, `/teachers`, `/week-schemes`,
  `/stundentafeln`, `/classes`, `/lessons`) keep their own prefixes unchanged.
  `/api` is applied once at the aggregate seam.
- `generate_router` in `scheduling/routes/lessons.py` is already aggregated under
  `scheduling_router`, so it picks up the `/api` prefix automatically.
- A new `health_router = APIRouter(tags=["health"])` with `@router.get("/health")`
  replaces the `@app.get("/health")` decorator. Lives next to `main.py` as a trivial
  module (or inline in `main.py`; either is fine, we pick inline to keep the churn
  small).

### Backend tests

Every HTTP path literal in `backend/tests/**/*.py` gains the `/api` prefix. 270
occurrences spread across 14 files. The change is mechanical and uses `sed`:

```
sed -i \
  -e 's|"/auth|"/api/auth|g' \
  -e "s|f\"/auth|f\"/api/auth|g" \
  -e 's|"/subjects|"/api/subjects|g' \
  -e "s|f\"/subjects|f\"/api/subjects|g" \
  -e 's|"/rooms|"/api/rooms|g' \
  -e "s|f\"/rooms|f\"/api/rooms|g" \
  -e 's|"/teachers|"/api/teachers|g' \
  -e "s|f\"/teachers|f\"/api/teachers|g" \
  -e 's|"/week-schemes|"/api/week-schemes|g' \
  -e "s|f\"/week-schemes|f\"/api/week-schemes|g" \
  -e 's|"/stundentafeln|"/api/stundentafeln|g' \
  -e "s|f\"/stundentafeln|f\"/api/stundentafeln|g" \
  -e 's|"/classes|"/api/classes|g' \
  -e "s|f\"/classes|f\"/api/classes|g" \
  -e 's|"/lessons|"/api/lessons|g' \
  -e "s|f\"/lessons|f\"/api/lessons|g" \
  -e 's|"/health|"/api/health|g' \
  backend/tests/**/*.py
```

`/__test__/*` is deliberately not in the sed pattern: it stays at root.

Verification: `grep -c '"/api/'` before (0) and after (~270) per file, with a spot
check that no `/__test__/api/...` path accidentally got produced.

A new red-then-green pair goes first, exercising the mount:

```python
# backend/tests/test_health.py
async def test_health_is_reachable_at_api_prefix() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "solver_check": "ko"}


async def test_health_not_at_root() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 404
```

These replace the existing single-root-path test. First the pair fails (old mount);
after changing `main.py`, both pass.

### Frontend

- Regenerate `frontend/src/lib/api-types.ts` via `mise run fe:types`. The script
  imports the backend's `app` object and dumps `app.openapi()` to JSON. The resulting
  schema has `/api/...` as the keys in `paths`, so the generated `paths` TypeScript
  type propagates the new prefix.
- 24 `client.METHOD(...)` call sites in `frontend/src/` update to the new path. All
  are in `features/*/hooks.ts` plus `src/lib/auth.ts` and `src/routes/login.tsx`.
- `frontend/vite.config.ts`: `API_PREFIXES` array and the `Object.fromEntries` loop
  collapse to a single entry:
  ```ts
  proxy: {
    "/api": { target: BACKEND, changeOrigin: true },
  },
  ```
  The `preview` block collapses the same way.
- `frontend/tests/msw-handlers.ts`: 14 handlers update their URL literals to
  `${BASE}/api/...`.

### Playwright e2e

- `frontend/e2e/playwright.config.ts` `webServer.url` stays at
  `${BACKEND_URL}/__test__/health`. The testing router is unaffected.
- `frontend/e2e/flows/subjects.spec.ts` contains a comment that the `/subjects`
  direct-goto was blocked by the Vite proxy forwarding that path; with the proxy
  collapsed to `/api/*`, direct `page.goto("/subjects")` is now safe. That said,
  the test already goes through the dashboard and nav link and works, so we do
  NOT rewrite the e2e test in this spec. The OPEN_THINGS entry that called out the
  proxy collision gets removed.

### Deploy

- `deploy/compose.yaml`: backend `healthcheck.test` moves from
  `http://127.0.0.1:3001/health` to `http://127.0.0.1:3001/api/health`.
- `deploy/README.md`: the first-deploy curl check switches from `/health` to
  `/api/health`. The follow-up section grows a bullet pointing at the
  `server-infra/Caddyfile` revert.
- No other deploy changes. The one-shot migrate container runs `alembic upgrade
  head` and does not talk HTTP.

### Docs

- `docs/architecture/overview.md`: one-line update to the HTTP API bullet, reflecting
  the `/api/*` mount and that `/health` lives there.
- `docs/architecture/authentication.md`: every path literal gains `/api`
  (`POST /api/auth/login`, `GET /api/auth/me`, etc.). ADR-style historical specs
  under `docs/superpowers/specs/` stay as-is (they are snapshots of past decisions).
- New `docs/adr/0010-api-prefix.md` recording the decision. ADR 0009 covered the
  deploy topology and referenced the then-root-level paths; 0010 narrows the routing
  surface on top of that.
- `docs/superpowers/OPEN_THINGS.md`: remove the `Uniform /api prefix` entry and the
  `Direct navigation to /subjects collides with the Vite preview proxy` entry (both
  resolved). Do not touch unrelated entries.

## Implementation order

1. **Backend.** New test pair for `/api/health` + `/health` 404. `main.py` changes.
   Bulk-update the 270 path literals across 14 backend test files. `mise run test:py`
   and `mise run lint:py` green.
2. **Frontend.** Regenerate `api-types.ts` (the backend is now `/api/*`). Update 24
   `client.METHOD(...)` call sites, the Vite proxy, and the MSW handlers. `mise run
   fe:test` and `mise run fe:lint` green. `mise run fe:build` green.
3. **Deploy.** Update `deploy/compose.yaml` healthcheck and `deploy/README.md` curl
   examples. Add a follow-up note about the `server-infra` Caddy revert.
4. **Docs.** `docs/architecture/overview.md` one-line update; `authentication.md`
   path updates; new ADR `docs/adr/0010-api-prefix.md` + index entry in
   `docs/adr/README.md`; prune the two OPEN_THINGS entries.

Each step is its own Conventional Commit:

1. `refactor(backend): mount API under /api prefix`
2. `refactor(frontend): migrate api client and proxy to /api prefix`
3. `build(deploy): hit /api/health in staging compose and runbook`
4. `docs: document uniform /api prefix and retire related open items`

Between commits 1 and 2 the tree is briefly "red" (backend green, frontend pointing
at old paths). That's fine: CI only runs on the final state, and the red window
exists for one commit boundary in a single PR.

## Risks and mitigations

- **sed catches false positives.** `"/auth"` might appear inside a docstring or log
  line. Mitigation: after the sed run, `grep -c '"/api/'` and `grep -rn '"/api/'
  backend/tests` to review the delta; spot-check a sample.
- **Staging Caddy drift.** If the `server-infra` temporary matcher is not reverted,
  it still routes `/api/*` correctly because it enumerates the post-refactor roots
  (`/auth`, `/subjects`, etc.) that no longer exist. Those routes now 404 through
  Caddy and through the backend equally, so the worst case is a stale config with
  no user-visible effect until the `server-infra` PR lands.
- **Regenerated types diff is large.** `src/lib/api-types.ts` is gitignored and
  regenerated in CI, so no diff ships. The SPA commits only contain the hook call
  site updates.
- **Unit function-name check.** `scripts/check_unique_fns.py` runs in pre-commit.
  Adding new test functions to `test_health.py` must keep unique names. The
  concrete names are `test_health_is_reachable_at_api_prefix` and
  `test_health_not_at_root`, neither clashes with the existing
  `test_health_returns_ok_and_exercises_solver`.
- **ADR style.** CLAUDE.md notes that new ADRs must use a colon (`# NNNN: Title`)
  instead of the template's em-dash. Apply when writing ADR 0010.

## Validation

- `mise run test` green.
- `mise run lint` green.
- `mise run fe:build` green.
- `curl http://localhost:8000/api/health` returns 200; `curl
  http://localhost:8000/health` returns 404 (manual spot check).
- `grep -rnE '"/(auth|subjects|rooms|teachers|week-schemes|stundentafeln|classes|lessons|health)[/"]' backend/tests` returns zero, except any `"/__test__"` reference.
- `grep -rnE 'client\.(GET|POST|PATCH|DELETE)' frontend/src | grep -v '"/api/'`
  returns zero.
