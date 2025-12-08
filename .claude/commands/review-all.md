---
description: Comprehensive code review orchestrating parallel checks for tests, quality, and documentation
allowed-tools: Task, Read, Bash, Grep, Glob, Write
---

## Context

- Current branch: !`git branch --show-current`
- Associated PR: !`gh pr view --json number,title,url,baseRefName,state 2>/dev/null || echo "No PR found for this branch"`
- PR changed files: !`gh pr diff --name-only 2>/dev/null || echo "N/A"`
- Staged changes: !`git diff --cached --name-only`

## PR Detection Logic

When determining which files to review:

1. **If PR exists** (check "Associated PR" output above):
   - Use `gh pr diff --name-only` to get all files changed in the PR
   - This captures ALL commits in the PR, not just the last one
   - The base branch from PR info shows what we're comparing against

2. **If no PR exists**:
   - Fall back to `git diff --name-only HEAD~1` for recent changes
   - Or use staged changes if nothing committed yet

Use the "PR changed files" list above as the primary source for determining which files changed when a PR exists.

## Output Structure

All subagents write their raw findings to the `review/` directory (gitignored):
- `review/backend-tests.md` - Backend test results
- `review/frontend-tests.md` - Frontend test results
- `review/e2e-tests.md` - E2E test results
- `review/lighthouse-audit.md` - Lighthouse scores
- `review/code-quality.md` - Code quality analysis
- `review/docs-check.md` - Documentation status

After aggregation, actionable tasks are created in `tasks/todo/`:
- `tasks/todo/backend/` - Backend-specific tasks
- `tasks/todo/frontend/` - Frontend-specific tasks
- `tasks/todo/global/` - Cross-cutting tasks
- `tasks/todo/REVIEW-FINDINGS-SUMMARY.md` - Consolidated summary with logical groupings

First, ensure directories exist:
```bash
mkdir -p review tasks/todo/backend tasks/todo/frontend tasks/todo/global
```

## Mode Selection

If $ARGUMENTS contains "--quick":
  Run quick review (pre-commit + affected tests only)
Else:
  Run full comprehensive review

## Quick Review Mode (--quick)

1. Run pre-commit verification directly:
   ```bash
   uv run pre-commit run --all-files
   ```

2. Based on changed files, run only affected test subagents:
   - If backend files changed → Use backend-tests subagent
   - If frontend files changed → Use frontend-tests subagent

3. Read outputs from `review/` and create summary (no task creation for quick mode)

## Full Review Mode (default)

### Step 1: Pre-commit Verification
Run directly (not via subagent):
```bash
uv run pre-commit run --all-files
```

If pre-commit fails, document failures and continue with remaining checks.

### Step 2: Parallel Test Execution
Launch these subagents IN PARALLEL:

1. **backend-tests subagent**: Run backend unit tests → writes to `review/backend-tests.md`
2. **frontend-tests subagent**: Run frontend unit tests → writes to `review/frontend-tests.md`

### Step 3: Conditional Checks
Based on changed files:

- If critical paths changed (auth, core flows, API endpoints):
  → Use **e2e-tests subagent** → writes to `review/e2e-tests.md`

- If frontend files changed (components, pages, styles):
  → Use **lighthouse-audit subagent** → writes to `review/lighthouse-audit.md`

ensure that the necessary services are running!

### Step 4: Code Quality Analysis
Use **code-quality subagent** → writes to `review/code-quality.md`

### Step 5: Documentation Check
Use **docs-check subagent** → writes to `review/docs-check.md`

### Step 6: Create Tasks from Findings

After all subagents complete:

1. **Read all review files** from `review/` directory
2. **Group findings by type**:
   - Backend issues → `tasks/todo/backend/`
   - Frontend issues → `tasks/todo/frontend/`
   - Cross-cutting/docs → `tasks/todo/global/`

3. **Create individual task files** for significant findings:
   - Use ID format: `B-XXX` (backend), `F-XXX` (frontend), `G-XXX` (global)
   - Use naming: `{ID}-{action-verb}-{description}.md`
   - Follow task template from CLAUDE.md

4. **Create summary file**: `tasks/todo/REVIEW-FINDINGS-SUMMARY.md`

### Task File Template

```markdown
# {Task Title}

## Description
{What needs to be done and why}

## Acceptance Criteria
- [ ] {Criterion 1}
- [ ] {Criterion 2}

## Context
- Found by: {agent name}
- Priority: {HIGH/MEDIUM/LOW}
- Effort: {Small/Medium/Large}
- Related files: {file:line references}

## Notes
{Any additional context from the review}
```

### Summary File Template

```markdown
# Code Review Findings - Task Summary

Generated from comprehensive review of `{branch}` branch on {date}.

**PR:** #{pr_number} - {pr_title} ({pr_url}) [if PR exists]
**Base branch:** {baseRefName} [if PR exists]

## Task Overview

| ID | Task | Priority | Effort | Area |
|----|------|----------|--------|------|
| {ID} | {Title} | {Priority} | {Effort} | {backend/frontend/global} |

---

## Logical Groupings

### Group 1: Blocking Issues (Do First)
{Critical issues that must be fixed before merge}

### Group 2: {Category Name}
{Related tasks with dependency diagram}

---

## Recommended Work Order
1. {Task sequence based on priority and dependencies}

## Dependencies
{Task dependency tree}

## Total Effort Estimate
| Priority | Tasks | Estimated Hours |
|----------|-------|-----------------|
| HIGH | ... | ... |
| MEDIUM | ... | ... |
| LOW | ... | ... |
```

## Detection Patterns

### Backend files
- `backend/src/**/*.java`
- `backend/src/**/*.properties`
- `backend/src/**/*.yaml`

### Frontend files
- `frontend/src/**/*.tsx`
- `frontend/src/**/*.ts`
- `frontend/src/**/*.css`

### Critical paths (trigger E2E)
- `**/auth/**`
- `**/security/**`
- `**/api/**`
- `backend/src/main/java/**/controller/**`
- `frontend/src/pages/**`

## Guidelines

- **Prefer PR-based diffs** when a PR exists - this ensures all PR changes are reviewed, not just the last commit
- Run pre-commit first - if it fails catastrophically, note but continue
- Parallelize independent subagents for efficiency
- Skip conditional checks (E2E, Lighthouse) if their files aren't affected
- Always run code-quality for deep analysis
- Write raw findings to `review/` (gitignored)
- Create actionable tasks in `tasks/todo/` (tracked in git)
- Group related issues into single tasks when logical
- Provide clear, prioritized action items with effort estimates
- Include PR link in summary when reviewing a PR
