# Contributing

## Prerequisites

Rust is a hard prerequisite — it's needed both for the PyO3 bindings and for the dev tools below.

- **[Rust toolchain](https://rustup.rs)** (`cargo`, `rustc`, `rustfmt`, `clippy`)
- **[Lefthook](https://github.com/evilmartians/lefthook)** — Git hook runner
- **[Cocogitto](https://docs.cocogitto.io)** (`cog`) — Conventional Commits enforcer

### Installing the dev tools

Once `cargo` is on your `PATH`:

```bash
cargo install cocogitto
```

Install lefthook via any method listed in its [installation docs](https://github.com/evilmartians/lefthook/blob/master/docs/install.md), as long as the binary ends up on your `PATH`.

## First-time setup

```bash
lefthook install
```

This writes the git hook shims into `.git/hooks/`. Lefthook auto-discovers the hook config at `.config/lefthook.yaml`.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). A `commit-msg` hook runs `cog verify` and will reject non-conforming messages.

**Format:**

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

**Allowed types:**

| Type       | Use for                                             |
|------------|-----------------------------------------------------|
| `feat`     | A new feature (→ minor version bump)                |
| `fix`      | A bug fix (→ patch version bump)                    |
| `docs`     | Documentation-only changes                          |
| `style`    | Formatting, missing semicolons, etc. — no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                             |
| `test`     | Adding or correcting tests                          |
| `build`    | Build system or external dependency changes        |
| `ci`       | CI configuration changes                            |
| `chore`    | Other changes that don't touch src or tests        |
| `revert`   | Reverts a previous commit                           |

**Breaking changes:** append `!` after the type/scope, e.g. `feat(api)!: drop support for X`, or add a `BREAKING CHANGE:` footer.

**Examples:**

```
feat(auth): add refresh token rotation
fix(parser): handle empty input without panicking
docs: explain lefthook setup in CONTRIBUTING
chore(deps): bump cocogitto
refactor!: replace sync HTTP client with async
```

### Tips

- Use `cog commit feat auth "add refresh token rotation"` as a guided helper for writing compliant commits.
- `cog check` validates a range of existing commits — useful in CI for PRs.
- `cog changelog` generates `CHANGELOG.md` from the commit history.
- `cog bump` performs semver version bumps based on commit types.
