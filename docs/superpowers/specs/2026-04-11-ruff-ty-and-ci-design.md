# Ruff/ty configuration sweep + minimum-viable CI

**Status:** Draft
**Date:** 2026-04-11
**Scope:** PR #66 (`feature/scaffolding`)

## Motivation

PR #66 lands the polyglot scaffold but ships ruff/ty with placeholder configs and **no GitHub Actions at all**. `OPEN_THINGS.md` tracks both as deferred. This spec pulls them forward because:

1. **Lint/type configs are easier to tune now** — before any real product code creates a wall of pre-existing violations to grandfather.
2. **CI is needed before any other PR.** Without it, every future review depends on the author remembering to run `mise run lint && mise run test && mise run audit` locally. Lefthook covers commits/pushes on the author's machine, but says nothing about what merges into `master`.
3. **Conventional-commit enforcement has a gap.** `cog verify` runs on `commit-msg` locally, but if PRs are squash-merged the *PR title* becomes the commit and never sees the hook. The gap closes the moment the project switches from "all commits go through the author's machine" to "merge button on GitHub."

## Non-goals

These remain deferred (still tracked in `OPEN_THINGS.md`):

- Coverage upload to a third-party service (codecov/coveralls).
- Release automation (release-please, semver bumps via `cog bump` in CI).
- Wheel-building matrices for `solver-py` (no consumer yet).
- Container image builds.
- Dependabot for the Python/uv ecosystem (waiting on first-class `uv.lock` support).
- Auto-fix-on-PR bots.
- Branch protection rules — those are configured in GitHub UI/API, not in-repo.

## Part 1 — Ruff configuration

### Current state

```toml
[tool.ruff]
target-version = "py313"
line-length    = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "SIM"]
```

No `[tool.ruff.format]`, no per-file ignores, no isort first-party hint.

### Target state

Root `pyproject.toml`:

```toml
[tool.ruff]
target-version = "py313"
line-length    = 100
extend-exclude = ["target"]

[tool.ruff.format]
docstring-code-format = true

[tool.ruff.lint]
select = [
    "E", "W",   # pycodestyle
    "F",        # pyflakes
    "I",        # isort
    "B",        # bugbear
    "C4",       # comprehensions
    "UP",       # pyupgrade
    "SIM",      # simplify
    "RUF",      # ruff-specific
    "N",        # pep8-naming
    "PTH",      # pathlib over os.path
    "PIE",      # misc anti-patterns
    "RET",      # return statement hygiene
    "TID",      # tidy imports (banned relative imports etc.)
    "TC",       # type-checking import grouping
    "S",        # bandit (security)
    "ASYNC",    # async best practices
    "ERA",      # eradicate commented-out code
    "PL",       # pylint subset
]
ignore = [
    "PLR0913",  # too many arguments — common in FastAPI handlers / DI
    "PLR2004",  # global magic-value rule (re-allowed selectively in tests below)
]

[tool.ruff.lint.per-file-ignores]
"**/tests/**" = [
    "S101",     # assert is the point of a test
    "PLR2004",  # magic values are fine in test fixtures
]

[tool.ruff.lint.isort]
known-first-party = ["klassenzeit_backend", "klassenzeit_solver"]
```

### Why these rules

- `RUF` and `PIE` catch real footguns (e.g. `RUF013` implicit Optional, `PIE790` unnecessary `pass`).
- `PTH` future-proofs against the eventual filesystem code; cheap now, painful later.
- `S` (bandit) is critical for a backend that will eventually touch auth and DB. Catching `subprocess` shell-injection patterns early matters more than the false-positive rate.
- `ASYNC` matters because the backend is async-first.
- `TC` keeps `TYPE_CHECKING`-only imports out of runtime paths once the codebase grows.
- `D` (pydocstyle) deliberately omitted — too noisy for a scaffold; revisit when there's a public API.

### Validation

After config change, `mise run lint` must stay green. Any new violations in existing scaffold code are fixed in the same commit (small surface area; mostly the FastAPI handler and tests).

## Part 2 — ty configuration

### Current state

Zero. ty runs with inferred defaults: it picks up `requires-python = ">=3.13"` from `pyproject.toml`, walks `src/`, and uses error-level severity for everything.

### Target state

New block in root `pyproject.toml`:

```toml
[tool.ty.environment]
python-version  = "3.13"
python-platform = "linux"
root            = ["."]

[tool.ty.src]
respect-ignore-files = true

[tool.ty.rules]
# The PyO3 .so has no .pyi stubs yet (see OPEN_THINGS.md). Keep the rule
# enabled but at warn so a real broken import in pure-Python code still
# fires. The two existing `# ty: ignore[unresolved-import]` annotations
# remain — they suppress the warning at the call sites.
unresolved-import = "warn"
```

**Schema notes** (verified against `ty 0.0.29`, the version pinned in the dev deps):
- `root` lives under `[tool.ty.environment]` and is a *list of paths*. The older `[tool.ty.src] root` form is deprecated and emits a `deprecated-setting` warning.
- `[tool.ty.src] respect-ignore-files` is the correct location for the gitignore toggle.
- Rule name `unresolved-import` is stable since `0.0.1-alpha.1` (`ty explain rule unresolved-import`).

### Why pin python-version explicitly

ty's auto-detection reads `requires-python` and picks the *minimum* of the range. `>=3.13` happens to land on 3.13, but the moment someone bumps it to `>=3.13,<3.15`, ty would still pick 3.13 — not what we want long-term. Explicit pin makes intent permanent and survives `requires-python` widening.

### Why platform=linux

The backend only runs on Linux (production VPS, CI runners). Pinning means `sys.platform`-conditional stdlib types resolve consistently and CI doesn't drift from local on macOS dev machines.

### CI invocation tweak

`mise run lint` keeps the plain `uv run ty check`. CI overrides with `--output-format github --error-on-warning`:

- `--output-format github` emits errors as GitHub Actions workflow annotations (inline in PR diff view).
- `--error-on-warning` makes warning-level diagnostics (including the relaxed `unresolved-import`) fail CI even though they don't fail locally — keeps local feedback fast and CI strict.

This is done in the CI workflow file, not in mise, because it's CI-specific behavior.

## Part 3 — GitHub Actions

Three files, all under `.github/`.

### 3.1 `.github/workflows/ci.yml`

**Triggers:** `pull_request` against any branch, `push` to `master`.

**Concurrency:** cancel in-progress runs on the same ref when a new commit lands. Cuts CI cost on rapid pushes.

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Jobs (parallel, fail-fast off):**

1. **`lint`** — `mise run lint`
2. **`test`** — `mise run test`
3. **`audit`** — `mise run audit`. **Required** (not `continue-on-error`). Per design decision: cargo-deny advisories that break CI force same-day triage rather than rotting in a ticket queue.

All three jobs share the same setup steps:

```yaml
- uses: actions/checkout@v5
- uses: jdx/mise-action@v2
  with:
    install: true
    cache: true   # caches the mise install dir; cargo bins survive across runs
- uses: actions/cache@v4
  with:
    path: |
      ~/.cargo/registry
      ~/.cargo/git
      target
    key: cargo-${{ runner.os }}-${{ hashFiles('Cargo.lock') }}
    restore-keys: cargo-${{ runner.os }}-
- uses: actions/cache@v4
  with:
    path: ~/.cache/uv
    key: uv-${{ runner.os }}-${{ hashFiles('uv.lock') }}
    restore-keys: uv-${{ runner.os }}-
- run: mise install
- run: mise run install   # `uv sync` etc.
```

**Why three jobs not one:**
- Parallel wall-clock wins — cargo build for `test` won't block ruff/ty for `lint`.
- A failing audit doesn't hide failing tests in the same log.
- Each job can have its own caching strategy if it diverges later.

**Why drive everything through `mise run …`:**
- One source of truth. CI cannot drift from local. If `mise run lint` passes locally, the *exact same command* runs in CI.
- Adding a new linter is a one-line `mise.toml` edit; no CI yaml change.

**Ty CI invocation override:**
The `lint` job runs `mise run lint` as-is. To get GitHub annotations and `--error-on-warning` from ty without hard-coding CI behavior into `mise.toml`, the CI step uses an env var pattern: a separate `ty-strict` step runs `uv run ty check --output-format github --error-on-warning` *after* `mise run lint` succeeds. This is duplicated work (~1s) but keeps `mise.toml` CI-agnostic.

*Alternative considered and rejected:* gate the ty flags behind `${CI:+--error-on-warning}` inside `mise.toml`. Rejected because it's clever-magic and the duplication is cheap.

### 3.2 `.github/workflows/pr-title.yml`

```yaml
on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

jobs:
  lint-pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            perf
            test
            build
            ci
            chore
            revert
          requireScope: false
```

The type list mirrors `CONTRIBUTING.md`. Scope is optional (matches local cog behavior).

### 3.3 `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    commit-message:
      prefix: build
      include: scope

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    commit-message:
      prefix: ci
```

`commit-message.prefix` aligns dependabot's auto-commits with conventional-commits so PR titles pass the `pr-title` check above.

**Python deps deliberately not configured.** Dependabot's `pip` ecosystem doesn't understand `uv.lock`; running it would either no-op or desync the lockfile. Both violate the "uv add only" rule in `CLAUDE.md`. Tracked in `OPEN_THINGS.md` for revisit.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| New ruff rules surface lint failures in scaffold code | Fix in same commit; surface area is ~5 Python files |
| CI cache key thrash (uv.lock churn) | `restore-keys` fallback so partial cache hits still help |
| `audit` job blocks merges on upstream advisories outside our control | Explicitly accepted: forces same-day triage. `deny.toml` exemptions are the escape hatch. |
| Mise install in CI is slow on cold cache | `jdx/mise-action@v2` caches the install dir; cargo bins (nextest, llvm-cov, deny, machete) survive between runs |
| `pr-title` action drifts from `cog verify` rules | Type list copy-pasted from `CONTRIBUTING.md`; if `CONTRIBUTING.md` changes, both must update — noted as a future tech debt for a single source of truth |

## Verification

After implementation:

1. Locally on `feature/scaffolding`: `mise run lint && mise run test && mise run audit` — all green.
2. Push branch; observe three GitHub Actions jobs (`lint`, `test`, `audit`) + `lint-pr-title` complete successfully.
3. Force a deliberate violation (e.g. an unused import, caught by `F401`) on a throwaway branch to confirm CI fails. Revert.
4. Check that `mise run lint` and CI's `lint` job execute the *same command set* — diff `mise.toml` against the workflow file.
5. Open `OPEN_THINGS.md`: remove the "CI configuration" entry; add the "Dependabot for uv ecosystem" entry; keep the PyO3 type stubs entry.

## File touch list

- `pyproject.toml` (root) — ruff + ty config blocks
- `.github/workflows/ci.yml` — new
- `.github/workflows/pr-title.yml` — new
- `.github/dependabot.yml` — new
- `docs/superpowers/OPEN_THINGS.md` — strike CI item, add uv-dependabot item
- Possibly: scaffold Python files if any new ruff rule fires (expected to be small)
