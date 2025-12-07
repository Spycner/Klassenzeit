# Claude Code Architecture for Multi-Step Code Review Workflows

A comprehensive code review agent that spans pre-commit verification, multiple test suites, audits, and documentation checks requires careful architectural design within Claude Code's constraints. The **single-tier subagent limitation**—subagents cannot spawn other subagents—fundamentally shapes the approach. This report provides concrete patterns for a production-ready implementation.

## The single-tier constraint reshapes your architecture

Claude Code enforces a strict single-tier subagent model: the main agent can spawn up to **10 concurrent subagents**, but those subagents cannot spawn children. This prevents infinite recursion and keeps the system debuggable, but it means your code review workflow must be orchestrated from the top level.

Your current architecture likely tries to have a "review coordinator" subagent spawn specialized test runners. This won't work. Instead, the main Claude Code session (or SDK orchestrator) must directly spawn all parallel workers. Each subagent operates in complete context isolation—they can't communicate with each other directly. Results flow back only when a subagent completes and returns a summary.

**Critical constraint**: Each subagent starts with approximately **20,000 tokens of overhead** before receiving the task prompt. With 10 concurrent subagents, you're consuming ~200k tokens in overhead alone. Factor this into your concurrency decisions.

## Entry point recommendation: slash command as orchestrator

A custom slash command should serve as the entry point for your code review workflow. Create `.claude/commands/review-all.md`:

```markdown
---
description: Comprehensive code review orchestrating parallel checks for tests, quality, and documentation
allowed-tools: Task, Read, Bash, Grep, Glob
argument-hint: [--quick|--full]
---

## Context

- Current branch: !`git branch --show-current`
- Changed files: !`git diff --name-only HEAD~1`
- Staged changes: !`git diff --cached --name-only`

## Orchestration

Run a comprehensive code review with the following parallel subagents:

1. **backend-tests**: Run backend unit tests on changed Python/Node files
2. **frontend-tests**: Run frontend unit tests on changed React/Vue files  
3. **e2e-tests**: Run E2E tests if critical paths changed
4. **lighthouse-audit**: Run Lighthouse on affected routes
5. **code-quality**: Static analysis, linting, type checking
6. **docs-check**: Verify documentation is updated for API changes

If $ARGUMENTS contains "--quick", only run code-quality and the test suites directly affected by changes.

Aggregate all results and present a unified review report with:
- Critical issues (must fix before merge)
- Warnings (should address)
- Suggestions (consider for future)
```

The slash command approach provides several advantages: **explicit invocation** via `/review-all`, **pre-execution context injection** through `!` bash commands, **argument handling** for workflow variants, and the ability to specify exactly which tools are needed.

## Skills versus subagents: a functional separation

The documentation reveals a clear division of responsibilities:

| Concept | Purpose | Best Use |
|---------|---------|----------|
| **Skills** | Portable procedural knowledge | "How to run Jest tests correctly," "Lighthouse best practices" |
| **Subagents** | Independent task execution with context isolation | "Run all backend tests and report results" |
| **Slash Commands** | User-invoked entry points with pre-loaded context | "Orchestrate the full review workflow" |

For your code review workflow, create **skills for domain expertise** and **subagents for parallel execution**:

### Skills structure (`.claude/skills/`)

```
.claude/skills/
├── testing-standards/
│   └── SKILL.md          # How to run tests, interpret failures, fix common issues
├── lighthouse-analysis/
│   └── SKILL.md          # Lighthouse metrics, thresholds, optimization patterns
├── code-quality-rules/
│   └── SKILL.md          # Linting rules, type checking, team conventions
└── documentation-requirements/
    └── SKILL.md          # When docs need updating, API doc formats
```

Each skill uses **progressive disclosure**: only the name and description load at startup (~100 tokens), with full content loading only when invoked. This keeps your system prompt lean even with many skills installed.

Example skill for testing (`.claude/skills/testing-standards/SKILL.md`):

```markdown
---
name: testing-standards
description: Team testing conventions, test runner configurations, and failure interpretation. Use when running or analyzing tests.
---

# Testing Standards

## Quick reference

- Backend: `pytest -v --cov=src tests/`
- Frontend: `npm run test -- --coverage`
- E2E: `npx playwright test`

## Interpreting failures

When tests fail, analyze in this order:
1. Check if failure is flaky (re-run once)
2. Look for recent changes to test file or tested module
3. Check for environment issues (missing fixtures, DB state)

## Coverage requirements

- Minimum 80% line coverage for new code
- All public API functions require tests
- Critical paths require integration tests
```

### Subagent definitions (`.claude/agents/`)

```
.claude/agents/
├── backend-tests.md
├── frontend-tests.md
├── e2e-tests.md
├── lighthouse-audit.md
├── code-quality.md
└── docs-check.md
```

Example subagent for backend testing (`.claude/agents/backend-tests.md`):

```markdown
---
name: backend-tests
description: Run backend unit tests and analyze failures. Use when Python or Node backend files change.
tools: Bash, Read, Grep, Glob
model: sonnet
skills: testing-standards
---

You are a backend testing specialist. When invoked:

1. Identify changed backend files from git diff
2. Map changes to affected test files
3. Run targeted tests first: `pytest tests/ -k "test_affected_module"`
4. If targeted tests pass, run full suite
5. Analyze any failures with full context

Report format:
- Tests run: X
- Passed: X
- Failed: X (list each with root cause)
- Coverage impact: +/-X%
- Recommended fixes: (specific code suggestions)

Focus on actionable feedback. Don't just report failures—provide fix suggestions.
```

## Parallelizing mechanical checks

The main agent (or SDK orchestrator) spawns parallel subagents. Claude Code supports up to **10 concurrent tasks**, with additional tasks queued. For your workflow:

**Prompt pattern for parallel execution:**

```
Run these review tasks in parallel using 6 subagents:

1. Use the backend-tests subagent to run Python tests on changed backend files
2. Use the frontend-tests subagent to run Jest tests on changed React components
3. Use the e2e-tests subagent to run Playwright tests for affected user flows
4. Use the lighthouse-audit subagent to analyze performance of changed pages
5. Use the code-quality subagent to run ESLint, Prettier, mypy on all changes
6. Use the docs-check subagent to verify API documentation is current

After all complete, synthesize results into a unified review report.
```

**SDK approach for programmatic control:**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = query({
  prompt: "Run comprehensive code review on recent changes",
  options: {
    agents: {
      'backend-tests': {
        description: 'Run Python/Node backend tests on changed files',
        prompt: 'You are a backend testing specialist...',
        tools: ['Bash', 'Read', 'Grep'],
        model: 'sonnet'
      },
      'frontend-tests': {
        description: 'Run Jest/Vitest tests on changed components',
        prompt: 'You are a frontend testing specialist...',
        tools: ['Bash', 'Read', 'Grep'],
        model: 'haiku'  // Faster for mechanical test running
      },
      'code-quality': {
        description: 'Static analysis, linting, type checking',
        prompt: 'You are a code quality specialist...',
        tools: ['Bash', 'Read', 'Grep'],
        model: 'haiku'
      }
      // ... additional agents
    },
    permissionMode: 'bypassPermissions',  // For CI/CD automation
    settingSources: ['project']  // Only team-shared settings
  }
});
```

## Coordinating results across subagents

Since subagents cannot communicate directly, coordination happens through the orchestrating agent. The pattern is:

```
Main Agent → spawns subagents in parallel → waits for all → synthesizes results
```

**Three coordination patterns available:**

### Pattern 1: Main agent synthesis (recommended)

The main agent receives all subagent summaries and synthesizes them into a unified report. This is the default behavior and works well for most workflows.

### Pattern 2: File-based state sharing via hooks

Use hooks to persist subagent results for later aggregation:

```json
{
  "hooks": {
    "SubagentStop": [{
      "hooks": [{
        "type": "command",
        "command": "python .claude/hooks/capture_subagent_result.py"
      }]
    }]
  }
}
```

Hook script (`.claude/hooks/capture_subagent_result.py`):

```python
#!/usr/bin/env python3
import json
import sys
from pathlib import Path

input_data = json.load(sys.stdin)
results_dir = Path(".claude/review-results")
results_dir.mkdir(exist_ok=True)

# Write result to timestamped file
result_file = results_dir / f"{input_data.get('agent_name', 'unknown')}_{int(time.time())}.json"
result_file.write_text(json.dumps(input_data))
```

A subsequent UserPromptSubmit hook can inject these persisted results into context.

### Pattern 3: SDK event streaming

When using the SDK programmatically, capture results as subagents complete:

```typescript
const results: Map<string, string> = new Map();

for await (const message of result) {
  if (message.type === 'result' && message.subtype === 'task_complete') {
    results.set(message.agent_name, message.result);
  }
}

// All results available for synthesis
console.log("Review complete:", Object.fromEntries(results));
```

## MCP integration for extended tooling

MCP tools are **fully inherited by subagents** when the `tools` field is omitted. This enables powerful patterns:

```markdown
---
name: github-reviewer
description: Review GitHub PR and post comments
tools: Read, Grep, mcp__github__get_pull_request, mcp__github__create_review
---
```

Configure project-wide MCP servers in `.mcp.json`:

```json
{
  "mcpServers": {
    "github": {
      "type": "http", 
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": { "SENTRY_AUTH_TOKEN": "${SENTRY_TOKEN}" }
    }
  }
}
```

Subagents can then query Sentry for related errors, check GitHub CI status, or post review comments directly.

## Complete recommended architecture

```
.claude/
├── commands/
│   ├── review-all.md           # Main entry point: /review-all
│   ├── review-quick.md         # Fast path: /review-quick (lint + affected tests only)
│   └── review-security.md      # Security focus: /review-security
├── agents/
│   ├── backend-tests.md        # Python/Node test runner
│   ├── frontend-tests.md       # React/Vue test runner
│   ├── e2e-tests.md            # Playwright/Cypress runner
│   ├── lighthouse-audit.md     # Performance analysis
│   ├── code-quality.md         # Linting, typing, formatting
│   └── docs-check.md           # Documentation verification
├── skills/
│   ├── testing-standards/      # Team testing conventions
│   ├── code-review-checklist/  # Review criteria
│   └── performance-budgets/    # Lighthouse thresholds
├── hooks/
│   └── settings.json           # Hook configuration
└── settings.json               # Project settings
```

## Key recommendations summarized

**Use a slash command as entry point** (`/review-all`) with pre-loaded git context via `!` bash execution. The command orchestrates the parallel subagent dispatch.

**Store procedural knowledge in skills** for testing conventions, quality rules, and review checklists. Skills provide progressive disclosure—only loading full content when needed.

**Define focused subagents** for each parallel task: backend tests, frontend tests, E2E, Lighthouse, quality, docs. Each subagent should have a single responsibility.

**Let the main agent synthesize results**—subagents return summaries when complete, and the orchestrator combines them into a unified review report.

**Use hooks for coordination** when you need to persist state between subagent runs or inject context from previous results.

**Consider the SDK for CI/CD** when you need programmatic control, session management, and integration with external automation systems.

**Leverage MCP for tool extension**—GitHub, Sentry, database access—all tools inherit to subagents by default, enabling rich integration without per-agent configuration.

The single-tier constraint isn't a limitation but a forcing function for clean architecture: flat orchestration, focused workers, and explicit coordination through the main agent rather than hidden inter-agent communication.