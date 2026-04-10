# Contributing

## Prerequisites

The only thing you install by hand is [mise](https://mise.jdx.dev/). mise provides every other tool (Rust, Python, uv, cocogitto, lefthook, cargo-nextest, cargo-llvm-cov, cargo-machete, cargo-deny) at the pinned versions defined in `mise.toml`.

## First-time setup

```bash
mise install         # installs the pinned toolchain
mise run install     # installs git hooks and syncs deps (builds the solver via maturin)
```

After this, `mise run test`, `mise run lint`, and `mise run dev` all work. See [`README.md`](README.md) for the full task table.

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
