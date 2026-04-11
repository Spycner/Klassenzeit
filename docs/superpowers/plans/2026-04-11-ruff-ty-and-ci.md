# Ruff/ty config sweep + minimum-viable CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull forward the deferred ruff/ty config tuning and the deferred CI wiring, landing both as additional commits on PR #66 (`feature/scaffolding`).

**Architecture:** Ruff and ty get expanded config blocks in the root `pyproject.toml`. CI splits into a fast per-PR loop (lint + test) and a scheduled supply-chain monitor (cargo-deny + pip-audit). All workflows drive through `mise run …` so local and CI cannot drift. A composite action absorbs the shared mise/cache setup. Branch protection settings are documented as a checked-in JSON applied out-of-band via `gh api`.

**Tech Stack:** ruff 0.15+, ty 0.0.29, GitHub Actions, `jdx/mise-action@v2`, `actions/cache@v4`, `amannn/action-semantic-pull-request@v5`, dependabot v2.

**Working directory:** `/home/pascal/Code/Klassenzeit/.worktrees/scaffolding` (already on branch `feature/scaffolding`). All shell commands assume this is the cwd.

**Reference spec:** [`docs/superpowers/specs/2026-04-11-ruff-ty-and-ci-design.md`](../specs/2026-04-11-ruff-ty-and-ci-design.md)

**Pre-flight context the executor needs:**
- The repo uses **lefthook** for git hooks. `pre-commit` runs `mise run lint`. **Every `git commit` will fail unless lint is green.** Always run `mise run lint` locally before committing.
- The repo uses **cocogitto** for commit-msg validation. Every commit message must be Conventional Commits compliant: `<type>(<scope>): <description>`. Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Python deps are managed by **uv only**. Never hand-edit `[project.dependencies]` or `[dependency-groups]`. Hand-editing `[tool.ruff]`, `[tool.ty]`, `[tool.uv.workspace]` etc. is fine — those are config, not deps.
- The PR is `feature/scaffolding` → `master`. Don't open a new PR; commits land directly on this branch and PR #66 picks them up automatically.

---

## File Structure

**Created:**
- `.github/actions/setup-mise/action.yml` — composite action that bootstraps mise + cargo/uv caches. Used by every CI workflow that needs the toolchain. Reason it exists: three jobs (`lint`, `test`, `audit`) all need the same ~20 lines of setup, and adding a composite action now is cheaper than the third copy-paste.
- `.github/workflows/ci.yml` — per-PR fast loop. Two parallel jobs: `lint` and `test`. Triggered on `pull_request` (any branch) and `push` to `master`.
- `.github/workflows/audit.yml` — supply-chain monitor. Single `audit` job. Triggered on weekly cron, lockfile-touching `pull_request`/`push`, and `workflow_dispatch`.
- `.github/workflows/pr-title.yml` — single job using `amannn/action-semantic-pull-request@v5` to validate PR titles against the conventional-commit type list.
- `.github/dependabot.yml` — cargo + github-actions ecosystems. Python/uv ecosystem deliberately omitted (dependabot doesn't grok `uv.lock`).
- `docs/superpowers/branch-protection.json` — checked-in record of recommended GitHub branch protection settings, applied via `gh api`.

**Modified:**
- `pyproject.toml` (root) — expanded `[tool.ruff]` block; new `[tool.ty.environment]`, `[tool.ty.src]`, `[tool.ty.rules]` blocks.
- `docs/superpowers/OPEN_THINGS.md` — strike "CI configuration" entry; add three new entries (uv-dependabot, audit auto-issue, pr-title duplication).

**Possibly modified (only if new ruff rules surface violations in scaffold code):**
- `backend/src/klassenzeit_backend/main.py`
- `backend/tests/test_health.py`
- `solver/solver-py/tests/test_bindings.py`

---

## Task 1: Expand ruff config and fix any surfaced violations

**Files:**
- Modify: `pyproject.toml` (root, lines 19-25 — the existing `[tool.ruff]` and `[tool.ruff.lint]` blocks)
- Possibly modify: any `.py` file under `backend/` or `solver/solver-py/` if a new rule fires

- [ ] **Step 1: Replace the existing ruff config block**

In the root `pyproject.toml`, find the current ruff section:

```toml
[tool.ruff]
target-version = "py313"
line-length    = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "SIM"]
```

Replace it with:

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
    "TID",      # tidy imports
    "TC",       # type-checking import grouping
    "S",        # bandit (security)
    "ASYNC",    # async best practices
    "ERA",      # eradicate commented-out code
    "PL",       # pylint subset
]
ignore = [
    "PLR0913",  # too many arguments — common in FastAPI handlers / DI
]

[tool.ruff.lint.per-file-ignores]
"**/tests/**" = [
    "S101",     # assert is the point of a test
    "PLR2004",  # magic values are fine in test fixtures (enforced in prod)
]

[tool.ruff.lint.isort]
known-first-party = ["klassenzeit_backend", "klassenzeit_solver"]
```

- [ ] **Step 2: Run ruff to surface new violations**

Run: `uv run ruff check`
Expected: probably 0-3 violations across the small scaffold (`main.py`, `test_health.py`, `test_bindings.py`). Note exactly what fires before moving on.

- [ ] **Step 3: Auto-fix what ruff can fix**

Run: `uv run ruff check --fix`
Expected: any violations with auto-fixes are resolved (e.g. `I` import sorting, `UP` upgrades, some `SIM` rewrites).

- [ ] **Step 4: Manually fix any remaining violations**

Run `uv run ruff check` again. For each remaining violation:
- Read the violation, look up the rule (`uv run ruff rule <code>` for an explanation), and fix the code to comply.
- If a rule is genuinely wrong for the project (not just inconvenient), don't suppress it inline — push back and revisit Task 1's rule list. **Do not add `# noqa` comments to silence rules without first considering whether the rule should be removed from the selection or added to per-file-ignores.**
- If you do add a `# noqa: <CODE>`, the comment must include a brief reason: `# noqa: S603  # subprocess args are hardcoded`.

- [ ] **Step 5: Run ruff format-check and ruff format**

Run: `uv run ruff format --check`
If anything is unformatted, run: `uv run ruff format`
Then re-run `uv run ruff format --check` and confirm clean.

- [ ] **Step 6: Run the full lint pipeline end-to-end**

Run: `mise run lint`
Expected: every linter (cargo fmt, clippy, machete, ruff check, ruff format, ty, vulture) passes. Output ends with `summary: (done in N seconds) ✔️ lint`.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml
# also any .py files modified by auto-fix or manual fixes
git status   # confirm only expected files are staged
git commit -m "build(ruff): broaden lint rule selection to best-practice set

Adds C4, RUF, N, PTH, PIE, RET, TID, TC, S, ASYNC, ERA, PL on top of
the existing E/F/W/I/B/UP/SIM. Test directories get S101 (assert) and
PLR2004 (magic values) per-file-ignores. PLR0913 globally ignored
because FastAPI handlers naturally take many DI args. Adds explicit
[tool.ruff.format] and isort known-first-party hint."
```

If the commit message reveals that you also fixed N violations in scaffold files, add a `Also fixes N pre-existing violations surfaced by the broadened rule set.` line above the body.

---

## Task 2: Validate the new ruff rules actually catch what they claim to (red-green sanity check)

**Why this task exists:** Adding rules without proving they work is faith-based. Ten seconds of red-green here pays dividends every time someone wonders "is `S` actually on?"

**Files:** No persistent changes — this task is pure verification on a throwaway file.

- [ ] **Step 1: Create a deliberately-violating Python file**

Create `/tmp/ruff-validation.py`:

```python
import os                          # noqa: I001 (out of import order on purpose)

PASSWORD = "hunter2"               # S105

path = os.path.join("a", "b")     # PTH118

print("hello")                     # nothing — print is allowed (no T20 in selection)
```

- [ ] **Step 2: Lint the file with the project config**

Run: `uv run ruff check /tmp/ruff-validation.py --config pyproject.toml`
Expected: at least two violations reported — `S105` (hardcoded password) and `PTH118` (use `Path` over `os.path.join`).

If `S105` does not fire, the `S` ruleset is not active and Task 1 needs revisiting.
If `PTH118` does not fire, the `PTH` ruleset is not active and Task 1 needs revisiting.

- [ ] **Step 3: Delete the validation file**

```bash
rm /tmp/ruff-validation.py
```

No commit — nothing changed in the repo.

---

## Task 3: Add ty config block and validate

**Files:**
- Modify: `pyproject.toml` (root, append after the ruff block)

- [ ] **Step 1: Add the ty config block**

Append to the root `pyproject.toml`, after the `[tool.ruff.lint.isort]` block but before `[tool.vulture]`:

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

- [ ] **Step 2: Run ty and verify no deprecated-setting warnings**

Run: `uv run ty check`
Expected: `All checks passed!` — no deprecated-setting warnings, no unresolved-import errors (because the rule is now `warn`-level and we suppress at the call sites anyway).

If a warning like `The "src.root" setting is deprecated` appears, the `root` field was placed under `[tool.ty.src]` instead of `[tool.ty.environment]`. Fix and re-run.

- [ ] **Step 3: Validate the rule severity actually changed (red-green for ty)**

Temporarily delete the `# ty: ignore[unresolved-import]` comment from `backend/src/klassenzeit_backend/main.py:4`. Run `uv run ty check`. Expected: a single `warning` (not `error`) about `klassenzeit_solver`.

Then run: `uv run ty check --error-on-warning`
Expected: ty exits non-zero — the warning is now treated as an error. This proves the CI invocation flag works.

Restore the `# ty: ignore[unresolved-import]` comment exactly as it was. Run `uv run ty check` once more — expected: clean.

- [ ] **Step 4: Run the full lint pipeline**

Run: `mise run lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml
git commit -m "build(ty): add explicit ty config block

Pins python-version=3.13 and python-platform=linux so checks don't drift
across dev machines. Sets root=[\".\"] under [tool.ty.environment]
(the [tool.ty.src] root form is deprecated since 0.0.29). Drops
unresolved-import to warn so the PyO3 stub gap doesn't mask real broken
imports — CI uses --error-on-warning to fail strict, local stays loose."
```

---

## Task 4: Create the composite action `setup-mise`

**Files:**
- Create: `.github/actions/setup-mise/action.yml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .github/actions/setup-mise
```

- [ ] **Step 2: Write the composite action**

Write `.github/actions/setup-mise/action.yml`:

```yaml
name: Setup mise toolchain and caches
description: >
  Bootstraps mise (Rust + Python + cargo bins) and primes cargo/uv
  caches. Assumes the repo has already been checked out by the caller.

runs:
  using: composite
  steps:
    - uses: jdx/mise-action@v2
      with:
        install: true
        cache: true

    - name: Cache cargo registry, git, and target
      uses: actions/cache@v4
      with:
        path: |
          ~/.cargo/registry
          ~/.cargo/git
          target
        key: cargo-${{ runner.os }}-${{ hashFiles('Cargo.lock') }}
        restore-keys: |
          cargo-${{ runner.os }}-

    - name: Cache uv
      uses: actions/cache@v4
      with:
        path: ~/.cache/uv
        key: uv-${{ runner.os }}-${{ hashFiles('uv.lock') }}
        restore-keys: |
          uv-${{ runner.os }}-

    - name: Bootstrap deps (lefthook + uv sync)
      shell: bash
      run: |
        mise install
        mise run install
```

**Notes for the executor:**
- `actions/checkout@v5` is **not** inside this composite action. The caller workflow must invoke it before calling `./.github/actions/setup-mise`. (Composite actions live inside the repo, so checkout must happen first.)
- `shell: bash` is required on every `run:` step inside a composite action — it has no default shell.
- `jdx/mise-action@v2` with `cache: true` already caches the mise install dir (which contains the cargo bins like `cargo-nextest`, `cargo-deny`, etc. — these are slow to compile fresh, so this cache is the most important one).

- [ ] **Step 3: Sanity-check yaml syntax**

If `actionlint` is available:
```bash
actionlint .github/actions/setup-mise/action.yml
```

If not, use Python:
```bash
uv run python -c "import yaml; yaml.safe_load(open('.github/actions/setup-mise/action.yml'))"
```
Expected: no output (valid YAML).

- [ ] **Step 4: Commit**

```bash
git add .github/actions/setup-mise/action.yml
git commit -m "ci: add reusable setup-mise composite action

Bootstraps mise + cargo/uv caches in one place so the lint, test, and
audit workflow jobs don't each carry their own copy-pasted setup block.
Caching the mise install dir is the dominant CI speedup since it
contains the cargo-installed dev tools."
```

---

## Task 5: Create `ci.yml` (lint + test, per-PR)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/setup-mise
      - name: Run mise lint pipeline
        run: mise run lint
      - name: Ty (strict, with GitHub annotations)
        run: uv run ty check --output-format github --error-on-warning

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/setup-mise
      - name: Run mise test pipeline
        run: mise run test
```

**Notes for the executor:**
- `permissions: contents: read` is the principle-of-least-privilege baseline. CI doesn't need to write anything.
- The two jobs run **in parallel** by default (no `needs:` between them). That's deliberate.
- The `Ty (strict)` step is *after* `mise run lint` so the same rules run twice: once via mise (matches local), once with CI-only flags (`--output-format github --error-on-warning`). Duplicated work is ~1 second; the alternative — pushing CI flags into `mise.toml` — couples mise to CI behavior.

- [ ] **Step 2: Validate yaml syntax**

```bash
uv run python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no output.

If `actionlint` is available, also run:
```bash
actionlint .github/workflows/ci.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add per-PR lint + test workflow

Two parallel jobs driving through mise so CI cannot drift from local.
Triggers on every PR and on push to master. Cancels stale runs on the
same ref via concurrency group. Ty runs twice in the lint job: once via
mise (parity with local) and once with --output-format github
--error-on-warning for inline annotations and CI strictness."
```

---

## Task 6: Create `audit.yml` (cargo-deny + pip-audit, scheduled)

**Files:**
- Create: `.github/workflows/audit.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/audit.yml`:

```yaml
name: Audit

on:
  schedule:
    # Mondays 06:17 UTC. The :17 minute is deliberate — :00 hits
    # GitHub's hourly cron stampede and gets queued.
    - cron: '17 6 * * 1'
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

concurrency:
  group: audit-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  audit:
    name: Supply-chain audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/setup-mise
      - name: Run mise audit pipeline
        run: mise run audit
```

**Notes for the executor:**
- The path filter on `pyproject.toml` (PR trigger only, not push) catches new dev-deps being added even when `uv.lock` *also* changes. Belt-and-suspenders.
- `deny.toml` is in the PR trigger so a policy change (e.g. tightening license rules) re-runs cargo-deny against current state.
- `audit.yml` is **not** a required status check in branch protection. See spec §3.5 for the path-filter footgun reasoning.

- [ ] **Step 2: Validate yaml syntax**

```bash
uv run python -c "import yaml; yaml.safe_load(open('.github/workflows/audit.yml'))"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/audit.yml
git commit -m "ci: add weekly supply-chain audit workflow

Runs cargo-deny + pip-audit via mise. Triggers: weekly Monday cron,
lockfile/policy-touching PRs, push to master with same paths, and
manual workflow_dispatch. Not a required status check by design —
GitHub branch protection's static required-checks list does not
compose with path filters. The cron is the real backstop."
```

---

## Task 7: Create `pr-title.yml`

**Files:**
- Create: `.github/workflows/pr-title.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/pr-title.yml`:

```yaml
name: PR Title

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

permissions:
  pull-requests: read

jobs:
  lint-pr-title:
    name: Validate PR title is conventional-commits compliant
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
          subjectPattern: ^[a-z].+$
          subjectPatternError: |
            The PR title subject must start with a lowercase letter.
            Got: "{subject}"
```

**Notes for the executor:**
- The type list is copy-pasted from `CONTRIBUTING.md` and must stay in sync. Drift is tracked in `OPEN_THINGS.md` (Task 10).
- `subjectPattern: ^[a-z].+$` enforces the convention that subjects start with a lowercase verb (matching cog's default behavior).
- `permissions: pull-requests: read` is sufficient — the action only reads the PR title.

- [ ] **Step 2: Validate yaml syntax**

```bash
uv run python -c "import yaml; yaml.safe_load(open('.github/workflows/pr-title.yml'))"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr-title.yml
git commit -m "ci: validate PR titles against conventional commits

Closes the squash-merge gap: lefthook + cog enforce commit-msg locally,
but if PRs are squash-merged the PR title becomes the commit and
bypasses the local hook entirely. amannn/action-semantic-pull-request
runs against the same type list as CONTRIBUTING.md."
```

---

## Task 8: Create `dependabot.yml`

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write the dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "07:00"
      timezone: Etc/UTC
    open-pull-requests-limit: 5
    commit-message:
      prefix: build
      include: scope
    labels:
      - dependencies
      - rust

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "07:00"
      timezone: Etc/UTC
    open-pull-requests-limit: 5
    commit-message:
      prefix: ci
    labels:
      - dependencies
      - github-actions
```

**Notes for the executor:**
- `commit-message.prefix` is **load-bearing**: it makes dependabot's auto-PR titles pass the `pr-title.yml` check (`build(deps): bump foo from 1.0 to 1.1`).
- The `github-actions` ecosystem also scans `.github/actions/**/action.yml` (the composite action from Task 4), so `jdx/mise-action`, `actions/cache`, etc. inside it will get update PRs.
- **No `pip` or `uv` ecosystem.** Dependabot doesn't natively understand `uv.lock` and the `pip` adapter would desync the lockfile. Tracked in `OPEN_THINGS.md`.

- [ ] **Step 2: Validate yaml syntax**

```bash
uv run python -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: enable dependabot for cargo and github-actions

Weekly Monday updates with conventional-commit prefixes so the resulting
PR titles pass the pr-title check. Python/uv ecosystem deliberately
omitted — dependabot doesn't grok uv.lock and pip-as-a-shim would
desync the lockfile, violating the uv-add-only rule in CLAUDE.md."
```

---

## Task 9: Create `branch-protection.json`

**Files:**
- Create: `docs/superpowers/branch-protection.json`

- [ ] **Step 1: Write the branch protection JSON**

Create `docs/superpowers/branch-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint",
      "Test",
      "Validate PR title is conventional-commits compliant"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

**Notes for the executor:**
- The `contexts` strings must **exactly** match the GitHub-displayed job names — that's the `name:` field of each job in the workflows from Tasks 5 and 7. Specifically:
  - `Lint` → from `ci.yml` job `lint` with `name: Lint`
  - `Test` → from `ci.yml` job `test` with `name: Test`
  - `Validate PR title is conventional-commits compliant` → from `pr-title.yml` job `lint-pr-title` with that exact `name:`
- `strict: true` corresponds to "Require branches to be up to date before merging" in the GitHub UI.
- `enforce_admins: false` lets the repo owner bypass protection in emergencies. Solo project, low risk.
- `required_approving_review_count: 0` is intentional — solo project, no co-reviewers.
- This file is **applied out-of-band**, not by CI. The application command lives in Task 12.

- [ ] **Step 2: Validate JSON syntax**

```bash
uv run python -c "import json; json.load(open('docs/superpowers/branch-protection.json'))"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/branch-protection.json
git commit -m "docs: record recommended GitHub branch protection settings

Branch protection lives in GitHub settings, not in-repo, but committing
a JSON record of the desired state makes it reproducible via gh api
and surfaces drift via diff. Required checks: Lint, Test, and
Validate PR title is conventional-commits compliant. Audit is
intentionally not required — see spec section 3.5."
```

---

## Task 10: Update `OPEN_THINGS.md`

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Read the current file**

```bash
cat docs/superpowers/OPEN_THINGS.md
```

Note the existing structure and the line `**CI configuration.** No GitHub Actions / pipeline config yet. ...`.

- [ ] **Step 2: Strike the CI configuration entry and add three new entries**

Edit `docs/superpowers/OPEN_THINGS.md`:

1. **Remove** the entire `**CI configuration.**` bullet (the whole line).
2. **Add** three new bullets, ordered by importance, in the same `## From [project scaffolding design]` section. Place them after the existing `**License.**` entry:

```markdown
- **Auto-issue creation on weekly audit failure.** The `audit.yml` cron run is informational only — failures show up in the Actions tab but nothing pages anyone. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body. Wire this in once the audit produces enough signal to be worth the noise.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).
- **PR-title type list duplicates `CONTRIBUTING.md`.** `.github/workflows/pr-title.yml` carries its own copy of the conventional-commit type list. If `CONTRIBUTING.md` adds a type, the workflow must update too. Single source of truth needed (e.g. generate the workflow from a templated config).
```

- [ ] **Step 3: Verify the file is well-formed and the strikes/additions match Task 10's intent**

```bash
grep -n "CI configuration" docs/superpowers/OPEN_THINGS.md
```
Expected: no output (entry was removed).

```bash
grep -n "Auto-issue creation\|Dependabot for the Python\|PR-title type list" docs/superpowers/OPEN_THINGS.md
```
Expected: three matches, one per new entry.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs(open-things): track audit auto-issue, uv dependabot, pr-title duplication

Strikes the now-resolved CI configuration entry. Adds three new
deferred items surfaced by the ruff/ty/CI sweep: auto-issue creation
on weekly audit failure, dependabot for the uv ecosystem, and the
pr-title type list duplication with CONTRIBUTING.md."
```

---

## Task 11: Push the branch and observe CI runs

**Files:** None — this is verification.

- [ ] **Step 1: Push the branch**

```bash
git push origin feature/scaffolding
```

Expected: push succeeds (lefthook `pre-push` runs `mise run test` first; both should already be green from Task 1+3 work).

- [ ] **Step 2: Open the PR in a browser or via gh**

```bash
gh pr view 66 --web   # or `gh pr checks 66` for terminal-only
```

- [ ] **Step 3: Wait for the workflows to start, then observe**

```bash
gh pr checks 66 --watch
```

Expected: **four checks** appear and run in parallel:
- `Lint` (from `ci.yml`)
- `Test` (from `ci.yml`)
- `Validate PR title is conventional-commits compliant` (from `pr-title.yml`)
- `Supply-chain audit` (from `audit.yml`) — fires because Tasks 1 and 3 modified the root `pyproject.toml`, which matches `audit.yml`'s `**/pyproject.toml` path filter. This is desirable: it proves the filter works.

All four expected green. The audit run validates that no new advisories landed against the existing dep set, even though we didn't add any deps in this PR.

- [ ] **Step 4: Manually trigger `audit.yml` via workflow_dispatch**

```bash
gh workflow run audit.yml --ref feature/scaffolding
```
Then:
```bash
gh run list --workflow=audit.yml --limit=3
```
Expected: a new `Audit` run appears, triggered by `workflow_dispatch`. Wait for it to complete green:
```bash
gh run watch
```

- [ ] **Step 5: Confirm cron schedule is registered**

```bash
gh api repos/:owner/:repo/actions/workflows | jq '.workflows[] | select(.name=="Audit")'
```
Expected: returns the workflow with `state: active`. The cron itself doesn't fire until the next Monday 06:17 UTC, so we can't observe it run inline — confirming it's registered is sufficient.

- [ ] **Step 6: No commit — this is observation only**

If any check failed, debug and re-push fixes (squash-fixup commits into the relevant earlier task commits via `git rebase -i` if the failure is logically attributable to that task; otherwise add a `fix(ci): ...` commit). Do not proceed to Task 12 until all four checks are green.

---

## Task 12: Apply branch protection via `gh api` and verify readback

**Files:** None — out-of-band GitHub config change.

- [ ] **Step 1: Determine repo owner/name**

```bash
gh repo view --json owner,name
```
Note the values for the `gh api` URL.

- [ ] **Step 2: Apply branch protection**

```bash
gh api -X PUT \
  repos/$(gh repo view --json owner --jq .owner.login)/$(gh repo view --json name --jq .name)/branches/master/protection \
  --input docs/superpowers/branch-protection.json
```

Expected: returns the applied protection JSON (HTTP 200). Any 422 means a `contexts` string doesn't match a real status check — confirm the workflows from Task 11 have actually reported at least once first (you can't require a check that has never run).

- [ ] **Step 3: Read back and diff against the source**

```bash
gh api repos/$(gh repo view --json owner --jq .owner.login)/$(gh repo view --json name --jq .name)/branches/master/protection \
  | jq '{
      required_status_checks: .required_status_checks,
      enforce_admins: .enforce_admins.enabled,
      required_pull_request_reviews: .required_pull_request_reviews,
      restrictions: .restrictions,
      required_linear_history: .required_linear_history.enabled,
      allow_force_pushes: .allow_force_pushes.enabled,
      allow_deletions: .allow_deletions.enabled,
      required_conversation_resolution: .required_conversation_resolution.enabled
    }' > /tmp/applied-protection.json
```

```bash
diff <(jq -S . docs/superpowers/branch-protection.json) <(jq -S . /tmp/applied-protection.json)
```

Expected: small or zero diff. GitHub adds some `enabled: true/false` envelopes in its read-back format that the jq above mostly normalizes. If a real semantic difference appears (e.g. a missing required check), fix the JSON and re-apply.

- [ ] **Step 4: Confirm the merge button is now gated**

Open PR #66 in a browser:
```bash
gh pr view 66 --web
```
Look for the "Merging is blocked" / "All checks have passed" indicator. If all four CI checks from Task 11 are green, the merge button should be enabled. If any required check is missing or red, it should be blocked.

- [ ] **Step 5: No commit — protection lives in GitHub settings**

The JSON file is the *record*; the actual change is in GitHub. Drift between the two is tracked as a risk in the spec.

---

## Task 13: Local lint-failure-path validation (prove the rule fires; no hook bypass)

**Why this task exists:** A green pipeline on a clean branch proves nothing about whether the pipeline actually catches violations. This task introduces a deliberate violation, runs `mise run lint` locally, watches it fail, then reverts. **This is local-only** — pushing a violating commit would require bypassing lefthook (`--no-verify` / `LEFTHOOK=0`), which violates the user's "never skip hooks" policy in CLAUDE.md. The local run is sufficient: CI runs the same `mise run lint` command, so a local failure proves a CI failure for the same input.

**Files:** Temporary edit, reverted before any commit.

- [ ] **Step 1: Stash any incidental working-tree changes**

```bash
git status
```

If anything is modified or staged, either commit it as part of the appropriate prior task or `git stash push -m "wip pre-failure-test"` it. The working tree must be clean before starting this task.

- [ ] **Step 2: Introduce a deliberate F401 violation**

Edit `backend/src/klassenzeit_backend/main.py`. Add an unused import directly after the existing `from fastapi import FastAPI` line:

```python
import json   # deliberate F401 for failure-path test — reverted in step 5
```

Save the file. **Do not run `git add`. Do not commit.**

- [ ] **Step 3: Run the lint pipeline and observe failure**

```bash
mise run lint
```

Expected: the `lint:py` step fails. Specifically, `uv run ruff check` reports:

```
backend/src/klassenzeit_backend/main.py:N:8: F401 [*] `json` imported but unused
```

The full pipeline exits non-zero, and the `summary:` line at the end shows `lint` as failed.

If `F401` does not fire, the ruff config is broken — Task 1 needs revisiting.

- [ ] **Step 4: Run `ruff check --fix` to confirm the auto-fix path**

```bash
uv run ruff check --fix backend/src/klassenzeit_backend/main.py
```

Expected: ruff removes the `import json` line automatically. The file is back to its pre-Step-2 state.

- [ ] **Step 5: Verify the working tree is clean**

```bash
git status backend/src/klassenzeit_backend/main.py
git diff backend/src/klassenzeit_backend/main.py
```

Expected: no diff. The file matches what was committed previously. If the diff shows leftover changes (e.g. trailing whitespace ruff added on the way through), run `git checkout -- backend/src/klassenzeit_backend/main.py` to fully restore.

- [ ] **Step 6: Run lint one more time to confirm green**

```bash
mise run lint
```
Expected: green.

- [ ] **Step 7: Restore stash if Step 1 created one**

```bash
git stash list
git stash pop   # only if there's a stash from Step 1
```

- [ ] **Step 8: No commit — failure path is validated, nothing to persist**

**Why this is enough validation:** CI runs `mise run lint` on the same commit content. The command is deterministic. If `mise run lint` rejects the violation locally, it will also reject it in CI on the same input. The remaining piece — *does CI report the failure correctly back to GitHub?* — is GitHub Actions infrastructure, not something this plan is validating. If it ever broke, every other action in the world would break too.

---

## Task 14: Final pre-merge sanity check

**Files:** None.

- [ ] **Step 1: Run the full local pipeline one last time**

```bash
mise run lint && mise run test && mise run audit
```
Expected: all green.

- [ ] **Step 2: Review the commit log on the branch**

```bash
git log --oneline master..feature/scaffolding
```

Expected: the original ~21 scaffolding commits, plus the 9 new commits from this plan (Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10). Tasks 2, 11, 12, 13, 14 don't produce commits. Rough count: ~30 commits total on the branch.

- [ ] **Step 3: Review the file diff against `master`**

```bash
git diff --stat master...feature/scaffolding
```
Expected file additions/changes for *this plan's contribution*:
- `pyproject.toml` (modified — ruff + ty blocks)
- `.github/actions/setup-mise/action.yml` (new)
- `.github/workflows/ci.yml` (new)
- `.github/workflows/audit.yml` (new)
- `.github/workflows/pr-title.yml` (new)
- `.github/dependabot.yml` (new)
- `docs/superpowers/branch-protection.json` (new)
- `docs/superpowers/OPEN_THINGS.md` (modified — strike + 3 new)
- `docs/superpowers/specs/2026-04-11-ruff-ty-and-ci-design.md` (new — already committed in earlier session)
- `docs/superpowers/plans/2026-04-11-ruff-ty-and-ci.md` (new — this file)
- Possibly: 1-3 `.py` files touched by ruff auto-fix or manual fixes in Task 1

- [ ] **Step 4: Check that PR #66 still shows all required checks green**

```bash
gh pr checks 66
```
Expected: `Lint ✓`, `Test ✓`, `Validate PR title is conventional-commits compliant ✓`, `Supply-chain audit ✓`.

- [ ] **Step 5: Done — ready for human review on PR #66**

No further commits. The next step is the human reviewer (or the user) deciding whether to merge.

---

## Summary of commits this plan produces

| # | Task | Commit subject |
|---|---|---|
| 1 | 1 | `build(ruff): broaden lint rule selection to best-practice set` |
| 2 | 3 | `build(ty): add explicit ty config block` |
| 3 | 4 | `ci: add reusable setup-mise composite action` |
| 4 | 5 | `ci: add per-PR lint + test workflow` |
| 5 | 6 | `ci: add weekly supply-chain audit workflow` |
| 6 | 7 | `ci: validate PR titles against conventional commits` |
| 7 | 8 | `ci: enable dependabot for cargo and github-actions` |
| 8 | 9 | `docs: record recommended GitHub branch protection settings` |
| 9 | 10 | `docs(open-things): track audit auto-issue, uv dependabot, pr-title duplication` |

Tasks 2 (ruff red-green), 11 (push + observe), 12 (apply branch protection), 13 (failure-path test), 14 (final sanity) produce no commits — they are verification.
