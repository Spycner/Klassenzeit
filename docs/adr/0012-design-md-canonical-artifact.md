# 0012: DESIGN.md as canonical design artifact

- **Status:** Accepted
- **Date:** 2026-04-24

## Context

The PK visual identity is split across two places. `frontend/src/styles/app.css` holds 319 lines of OKLCH tokens, shadow ramps, sidebar variables, and a `.dark` override block. It is the runtime source of truth but has no rationale and no prose. The 2026-04-19 frontend-design-implementation spec carries the rationale but is a point-in-time narrative, not a document that tracks the palette.

Agents writing new UI surfaces follow the `frontend-design` skill rule from `frontend/CLAUDE.md`. They need a single short canonical document they can load in seconds to understand what primary means, which fonts carry which roles, and how components compose. Neither existing file fits. The `google-labs-code/design.md` format (YAML frontmatter for tokens plus markdown prose, CLI `@google/design.md` with `lint`, Apache-2.0, version `alpha`) fits that missing middle layer. The evaluation in `docs/superpowers/specs/2026-04-24-design-md-adoption-design.md` recommended adoption because the agent-context-compression value outweighs the alpha-status risk.

## Decision

Adopt DESIGN.md at level 2: ship `frontend/DESIGN.md` as the canonical agent-facing artifact and wire `@google/design.md lint` into `mise run lint`. YAML captures light-mode tokens only; dark mode stays in `app.css`. The sRGB hex values in YAML are approximations of the authoritative OKLCH tokens in CSS; CSS remains the single runtime source of truth. Manual sync between the two files is enforced by a rule in `frontend/CLAUDE.md`, not by an automated sync-check.

## Alternatives considered

- **Level 1 (doc only, no CLI).** Rejected because a lint gate is what prevents the file drifting into rot.
- **Level 3 (codegen between YAML and CSS).** Rejected as out of scope and incompatible with the OKLCH-vs-sRGB semantic mismatch.
- **Dark-mode YAML.** Rejected because the `alpha` schema has no first-class mode support.

## Consequences

Agents get one file to load for the visual identity. The lint surfaces WCAG debt (`button-primary` 3.88:1, `button-secondary` 2.57:1) and orphaned tokens as warnings; these are tracked in `OPEN_THINGS.md` rather than suppressed. Upstream schema pivot at version `alpha` is a known risk, mitigated by pinning the CLI via pnpm. Duplication of token values between `app.css` and DESIGN.md is accepted; if upstream abandons the CLI, the `.md` file stays human-readable standalone. We would revisit this decision if the alpha schema breaks in a way that forces a rewrite, or if a DTCG-based successor displaces the format.
