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
- Auto-issue creation when the weekly audit cron fails (tracked separately).

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

Four files, all under `.github/`. CI is split into a **per-PR fast loop** (`ci.yml`) and a **scheduled supply-chain monitor** (`audit.yml`). The split reflects that linting and testing react to *our* code changes (PR cadence is correct), while audit advisories react to *upstream* changes (cron cadence is correct).

### 3.1 `.github/workflows/ci.yml` — fast per-PR loop

**Triggers:** `pull_request` against any branch, `push` to `master`.

**Concurrency:** cancel in-progress runs on the same ref when a new commit lands. Cuts CI cost on rapid pushes.

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Jobs (parallel):**

1. **`lint`** — `mise run lint`
2. **`test`** — `mise run test`

These two jobs are designed to be the **required status checks** in branch protection (see §3.5). They are deliberately scoped tight: lint + test cover everything that changes when the diff changes, and nothing that doesn't.

**Audit is intentionally NOT in this workflow.** It lives in `audit.yml` (§3.2). Reasoning:
- A typo fix doesn't change `Cargo.lock`, so re-running `cargo deny check` against unchanged dependency state on every PR is pure waste.
- Conversely, advisories on dependencies we already ship are published *between* PRs, on upstream's schedule, not ours.
- Keeping audit out of the per-PR critical path also means a Friday-afternoon RUSTSEC publication doesn't block an unrelated bugfix merge.

Both jobs share the same setup steps:

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

**Why two parallel jobs not one combined step:**
- Parallel wall-clock wins — cargo build for `test` won't block ruff/ty for `lint`.
- A failing test doesn't bury a lint failure (or vice versa) in the same log.
- Each job can have its own caching strategy if it diverges later.

**Why drive everything through `mise run …`:**
- One source of truth. CI cannot drift from local. If `mise run lint` passes locally, the *exact same command* runs in CI.
- Adding a new linter is a one-line `mise.toml` edit; no CI yaml change.

**Ty CI invocation override:**
The `lint` job runs `mise run lint` as-is. To get GitHub annotations and `--error-on-warning` from ty without hard-coding CI behavior into `mise.toml`, a separate `ty-strict` step runs `uv run ty check --output-format github --error-on-warning` *after* `mise run lint` succeeds. This is duplicated work (~1s) but keeps `mise.toml` CI-agnostic.

*Alternative considered and rejected:* gate the ty flags behind `${CI:+--error-on-warning}` inside `mise.toml`. Rejected because it's clever-magic and the duplication is cheap.

### 3.2 `.github/workflows/audit.yml` — supply-chain monitor

**Triggers** (three separate paths into the same job):

```yaml
on:
  schedule:
    - cron: '17 6 * * 1'   # Mondays 06:17 UTC — off the hour to dodge GitHub's cron stampede
  pull_request:
    paths:
      - 'Cargo.lock'
      - 'uv.lock'
      - 'deny.toml'
      - 'pyproject.toml'
      - '**/pyproject.toml'
  push:
    branches: [master]
    paths:
      - 'Cargo.lock'
      - 'uv.lock'
      - 'deny.toml'
  workflow_dispatch:
```

**Job:** `audit` runs `mise run audit` (which in turn runs `cargo deny check` + `uvx pip-audit`). Same mise/cache setup as `ci.yml`.

**Why four triggers:**

| Trigger | Catches |
|---|---|
| `schedule` weekly cron | New advisories published against deps we already ship — the dominant case |
| `pull_request` with path filter | A PR that *adds* a vulnerable dependency, caught at review time before merge |
| `push: master` with path filter | Belt-and-suspenders for the post-merge view (and historical runs visible on `master`) |
| `workflow_dispatch` | Manual escape hatch for "did this CVE land yet?" |

**Why not a required status check:**
GitHub branch protection's required-checks list is *static*. If we marked `audit` as required, the `ci.yml`-only PRs (no lockfile change) would never trigger `audit` and would sit in "Expected — Waiting for status to be reported" forever. The known workarounds (always-true skip jobs, conditional matrices) are uglier than the alternative: leave `audit` unrequired, let reviewers see the red X on lockfile-touching PRs, and accept that the cron is the real backstop.

**Failure visibility for the cron run:**
A failing scheduled run shows up in the Actions tab and on GitHub's notification settings, but nothing actively pages anyone. This is acceptable for now (project is pre-product, audience is one developer). The followup — auto-create a GitHub Issue on cron failure — is in `OPEN_THINGS.md`, not built here. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body.

### 3.3 `.github/workflows/pr-title.yml`

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

The `lint-pr-title` job is also a **required status check** in branch protection (see §3.5).

### 3.4 `.github/dependabot.yml`

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

### 3.5 Branch protection (GitHub-side config — documented, not committed)

Branch protection rules live in GitHub settings (UI or `gh api`), not in the repo. They are **the actual enforcement layer** — without them, the workflows above produce status checks that nothing requires. This section documents the recommended settings so they can be applied (and re-applied if the repo is recreated) without re-deriving them.

**On `master`:**

| Setting | Value | Why |
|---|---|---|
| Require a pull request before merging | ✅ | Gates everything else |
| Require approvals | 0 | Solo project; revisit when contributors arrive |
| Dismiss stale approvals on new commits | ✅ | Cheap correctness |
| Require status checks to pass before merging | ✅ | The whole point |
| Require branches to be up to date before merging | ✅ | Prevents the "green-on-old-base, red-on-merge" race |
| Required status checks | `lint`, `test`, `lint-pr-title` | Three checks, all from §3.1 / §3.3 |
| Require linear history | ✅ | Matches `cog`'s assumption that history is a sequence of conventional commits, not a merge tangle |
| Restrict who can push to matching branches | Allow only PRs (no direct push) | The merge button is the only way in |
| Allow force pushes | ❌ | Never on `master` |
| Allow deletions | ❌ | Never on `master` |

**Explicitly NOT required:** the `audit` job. See §3.2 for the path-filter footgun reasoning.

**How to apply:**

```bash
gh api -X PUT repos/:owner/:repo/branches/master/protection \
  --input docs/superpowers/branch-protection.json
```

The implementation plan (next step) will produce `docs/superpowers/branch-protection.json` as a checked-in record of the desired state, so applying it is reproducible. The plan will also include a verification step that reads the current protection back via `gh api` and diffs against the JSON.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| New ruff rules surface lint failures in scaffold code | Fix in same commit; surface area is ~5 Python files |
| CI cache key thrash (`uv.lock` churn) | `restore-keys` fallback so partial cache hits still help |
| Weekly audit failure sits unnoticed in the Actions tab | Accepted for now (solo project, low audience). Followup: auto-create a GitHub Issue on cron failure — see `OPEN_THINGS.md` |
| Path-filtered audit on PRs makes branch protection awkward | `audit` is intentionally NOT a required check — reviewer enforcement only. Documented in §3.2 + §3.5 |
| Mise install in CI is slow on cold cache | `jdx/mise-action@v2` caches the install dir; cargo bins (nextest, llvm-cov, deny, machete) survive between runs |
| `pr-title` action drifts from `cog verify` rules | Type list copy-pasted from `CONTRIBUTING.md`; if `CONTRIBUTING.md` changes, both must update — noted as a future tech debt for a single source of truth |
| Branch protection JSON in `docs/` drifts from actual GitHub settings | Verification step in the plan diffs `gh api` output against the checked-in JSON; failing diff is a CI follow-up, not a hard gate |

## Verification

After implementation:

1. Locally on `feature/scaffolding`: `mise run lint && mise run test && mise run audit` — all green.
2. Push branch; observe per-PR jobs (`lint`, `test`, `lint-pr-title`) complete successfully. The `audit` workflow should *not* trigger on this PR (no lockfile change in the impl PR — ruff/ty config + workflow files only).
3. Touch `Cargo.lock` or `uv.lock` on a throwaway branch to confirm `audit` does trigger and runs to completion.
4. Manually run `audit.yml` via `workflow_dispatch` from the Actions tab to confirm the cron-style invocation works.
5. Force a deliberate violation (e.g. an unused import, caught by `F401`) on a throwaway branch to confirm `lint` fails CI. Revert.
6. Check that `mise run lint` and CI's `lint` job execute the *same command set* — diff `mise.toml` against the workflow file.
7. Apply branch protection from `docs/superpowers/branch-protection.json` via `gh api`. Read it back and confirm `lint`, `test`, `lint-pr-title` are all in the required-checks list and `audit` is not.
8. Open a no-op PR; confirm the merge button is blocked until all three required checks report green.
9. Open `OPEN_THINGS.md`: remove the "CI configuration" entry; add entries for "Dependabot for uv ecosystem", "Auto-issue creation on weekly audit failure", and "PR-title type list duplicates `CONTRIBUTING.md`"; keep the PyO3 type stubs entry.

## File touch list

- `pyproject.toml` (root) — ruff + ty config blocks
- `.github/workflows/ci.yml` — new (lint + test)
- `.github/workflows/audit.yml` — new (cargo-deny + pip-audit, cron + lockfile-paths + dispatch)
- `.github/workflows/pr-title.yml` — new
- `.github/dependabot.yml` — new
- `docs/superpowers/branch-protection.json` — new (recommended GitHub branch protection settings, applied out-of-band)
- `docs/superpowers/OPEN_THINGS.md` — strike CI item, add uv-dependabot + audit-issue + pr-title-duplication items
- Possibly: scaffold Python files if any new ruff rule fires (expected to be small)
