# Adopt google-labs-code/design.md for the PK visual identity

Spec date: 2026-04-24
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` carries a standing item under "Design": *"https://github.com/google-labs-code/design.md evaluate and implement if found good."* The upstream repository publishes a format spec (YAML frontmatter + markdown prose) and a CLI (`@google/design.md` with `lint`, `diff`, `export`) that Google Labs proposes as a persistent, structured description of a design system for coding agents to consume.

Klassenzeit already has the substance of a design system. The canonical "PK" palette, typography, radii, shadow ramp, and sidebar tokens live in `frontend/src/styles/app.css`, and the rationale lives in the 2026-04-19 frontend design implementation spec. Agents doing UI work follow `frontend-design` (mandatory per `frontend/CLAUDE.md`). What is missing is a single, short, self-describing document that an agent can load in a couple of seconds to understand the visual identity before writing any markup. The 2026-04-19 spec is a point-in-time narrative; `app.css` is 319 lines of OKLCH tokens with no rationale. DESIGN.md's purpose is exactly that missing middle layer.

This spec adopts DESIGN.md narrowly: the document goes in, the CLI goes into the lint pipeline, and nothing in runtime CSS changes.

## Goals

- Land a `frontend/DESIGN.md` that passes `@google/design.md lint` with zero errors.
- Make the file the canonical agent-facing description of the PK visual identity (what primary means, which fonts carry which roles, how components compose).
- Wire the lint CLI as a pnpm devDependency of the frontend and run it under `mise run lint` so local, pre-commit, and CI paths all enforce the file.
- Record the decision in ADR 0012 and remove the Design item from `OPEN_THINGS.md`.

## Non-goals

- No change to `frontend/src/styles/app.css` runtime tokens, no change to any component, no change to any route.
- No generator of `app.css` from DESIGN.md, no generator of DESIGN.md from `app.css`, no programmatic sync-check between the two files.
- No Tailwind theme export, no DTCG export, no Figma variable round-trip.
- No dark-mode tokens in DESIGN.md YAML. Dark mode stays in `app.css`; the DESIGN.md prose references it narratively.
- No YAML entries for chart-N or sidebar-* tokens. Those are implementation details that do not need to be canonicalized.
- No lint floor tightening. `contrast-ratio` warnings on known-below-AA surfaces (secondary, destructive on white) are expected and tracked as follow-ups, not suppressed.

## Stack

- **Format:** `DESIGN.md`, version `alpha`, per the upstream README and `docs/spec.md` in `google-labs-code/design.md`.
- **CLI:** `@google/design.md` installed as a pnpm devDependency under `frontend/`. Version pinned via `pnpm add -D`.
- **Toolchain wiring:** new `[tasks."lint:design"]` in `mise.toml`, added to `[tasks.lint].depends`. Local runs, pre-commit (via lefthook's `mise run lint`), and CI all pick it up with no further wiring.

## File placement

- `frontend/DESIGN.md` is the single source file. Co-located with `frontend/CLAUDE.md` and `frontend/src/styles/app.css` so agents pulling frontend context find it on the same path. Not at repo root, not under `docs/`.

## YAML token schema (light mode only)

Colors follow the DESIGN.md-preferred names (`primary/secondary/tertiary/neutral`, plus semantic roles) mapped onto the CSS variables. Values are sRGB hex approximations of the authoritative OKLCH tokens in `app.css`, computed via coloraide with `clip` gamut mapping. Dark mode is not representable in the current DESIGN.md schema; it stays in `app.css` and is referenced in the prose.

```yaml
version: alpha
name: Klassenzeit PK
description: >
  Warm, literary, slightly analog school-schedule UI. Moss green primary,
  limestone neutral, broadsheet typography. Runtime source of truth is
  frontend/src/styles/app.css; hex values here are sRGB approximations of
  the authoritative oklch() tokens.

colors:
  primary:     "#608c5e"   # app.css --primary
  secondary:   "#7ba8bc"   # app.css --secondary
  tertiary:    "#d66c5d"   # app.css --destructive, re-cast as accent-for-destructive-actions
  neutral:     "#fffcf5"   # app.css --background
  surface:     "#f9f4ec"   # app.css --card
  on-surface:  "#3a342f"   # app.css --foreground
  muted:       "#f1e9db"
  on-muted:    "#7c7267"
  border:      "#e8dfd1"
  accent:      "#f5d1b0"
  error:       "#d66c5d"   # alias of tertiary

typography:
  headline-lg:
    fontFamily: Quicksand
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Quicksand
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
  body-lg:
    fontFamily: Lora
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Quicksand
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Quicksand
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Quicksand
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.3
  label-mono:
    fontFamily: Fira Code
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0.02em

rounded:
  sm: 12px
  md: 14px
  lg: 16px
  xl: 20px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 12px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "#547a52"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 12px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
```

Binding surface: token names, structure, the set of semantic colors, the typography levels, the rounded and spacing scales, and the set of components above. Free to adjust during implementation: hover-variant hex approximations, prose wording, and the exact channel rounding of any given hex (coloraide clip vs chroma-reduce can differ in the last digit). Any other change is a spec change and needs a revision.

## Markdown body

Sections, in canonical order:

1. **Overview** – Warm, editorial, slightly analog. Moss green carries *go* / primary CTA; limestone carries the page; Boston-clay orange is the destructive/attention axis. Fonts are a Quicksand body + Lora serif duet with Fira Code for data.
2. **Colors** – Palette story for each role, with both DESIGN.md-preferred name and the shadcn CSS variable it maps to. Explicit note: runtime source of truth is `app.css`.
3. **Typography** – Quicksand as the warm-sans workhorse; Lora as the literary body option for long prose; Fira Code for tabular data, timestamps, and mono contexts; Special Elite appears in dark mode only.
4. **Layout** – 8px scale, card-based grouping, 1200px max-width desktop, fluid on mobile.
5. **Elevation & Depth** – Warm subtle shadows in light, pure-black dramatic shadows in dark. Four levels.
6. **Shapes** – Soft but deliberate: `--radius: 1rem` base, `sm/md/lg/xl` derived.
7. **Components** – One paragraph per component block in YAML, explaining intent and variant coverage.
8. **Do's and Don'ts** – Maintain WCAG AA (surfacing known debt honestly), single primary CTA per screen, don't mix radii across a view, don't introduce new color tokens without updating this file *and* `app.css`, dark mode is authored in CSS only.

## Linting

`mise run lint:design` runs `pnpm -C frontend exec design.md lint DESIGN.md` and asserts zero errors. Warnings are allowed and documented.

Known warnings after first commit (verified against a scratch run of `@google/design.md lint` on a prototype of the file):

- `contrast-ratio` on `button-primary`: `#608c5e` on `#ffffff` = 3.88:1, below WCAG AA 4.5:1 for normal text (passes AA for large text ≥18pt).
- `contrast-ratio` on `button-secondary`: `#7ba8bc` on `#ffffff` = 2.57:1, below AA at any size.
- `orphaned-tokens` on any palette color not referenced by a component (e.g., `accent`, `tertiary` if the destructive variant is not wired as a component, `neutral` if page-level background is not a component).
- `missing-sections` info on any optional section we omit.

These warnings are surfaced, not suppressed. They represent existing UI debt in the light palette; the fix is either a darker primary or a dark textColor on primary buttons, which is a runtime CSS decision outside this spec. The spec's contribution is making the debt visible every time anyone runs `mise run lint`. A single follow-up item lands in `OPEN_THINGS.md` under "Product capabilities" capturing the contrast-ratio debt (one item covering both buttons, since the fix is the same shape).

## Architecture

Nothing runtime changes. Files touched:

- `frontend/DESIGN.md` – new.
- `frontend/package.json` + `frontend/pnpm-lock.yaml` – `@google/design.md` devDep.
- `frontend/CLAUDE.md` – one new sentence under a Styling sub-heading pointing agents to `DESIGN.md` + stating the manual-sync rule.
- `mise.toml` – new `[tasks."lint:design"]`, added to `[tasks.lint].depends`.
- `docs/adr/0012-design-md-canonical-artifact.md` + `docs/adr/README.md` index row.
- `docs/superpowers/OPEN_THINGS.md` – Design section removed; optional follow-ups added.

No test files are added. Lint gate is the verification surface.

## Testing strategy

- `mise run lint` must pass on the branch (exit 0).
- `mise exec -- pnpm -C frontend exec design.md lint DESIGN.md` prints a findings report with zero errors; warnings match the known-warning list documented above.
- `mise run fe:build`, `mise run test`, and the full lint suite run in CI as usual. No new tests; no changes to existing tests.

Manual verification checklist (one-off, documented in the PR body):

- Load only `frontend/DESIGN.md` in a fresh session and answer: *what is the primary color, which font is body-md, which radius does a primary button use*. Confirm each answer comes from the file with no need to open `app.css`.
- Confirm the hex approximations match `app.css` OKLCH values under coloraide conversion to within 1 channel step.
- Confirm `frontend/CLAUDE.md` has an agent-readable sentence linking to the file.

## Risks

- **Alpha schema pivot.** DESIGN.md is version `alpha`; a breaking schema change upstream could require a rewrite. Mitigation: pin the CLI version in `package.json`; Renovate / Dependabot flags updates for review.
- **Upstream abandonment.** The repo disclaims eligibility for Google's OSS Vulnerability Rewards Program. Mitigation: the file is human-readable standalone; if the CLI dies we drop the `lint:design` task and keep the doc.
- **Token-name mismatch with shadcn.** Klassenzeit uses shadcn's `primary/secondary/accent/muted/destructive`; DESIGN.md prefers `primary/secondary/tertiary/neutral` + `error`. Mitigation: YAML uses DESIGN.md names, prose maps both names so agents can translate.
- **OKLCH-to-sRGB approximation drift.** Hex in YAML drifts from OKLCH in CSS as channels shift under gamut mapping. Mitigation: prose names `app.css` as source of truth; drift on approximations is acceptable within 1-2% per channel.
- **Pre-commit cost.** `mise run lint` runs unconditionally on every commit via lefthook. Design lint adds a Node process spin-up (~100-300ms). Acceptable alongside ruff, biome, clippy, actionlint.

## Rollout

Single PR, two commits:

1. `docs(design): add frontend/DESIGN.md capturing PK visual identity` – ships the file, ADR 0012, the new CLAUDE.md sentence, and the OPEN_THINGS update. Pre-commit runs without `lint:design`, so the file is not yet enforced.
2. `chore(frontend): add @google/design.md devDep and lint:design task` – adds the dependency and wires the new mise task. Pre-commit now lints the file from commit 1; CI does the same.

Each commit is self-green. Reverting commit 2 leaves a valid un-linted DESIGN.md. Reverting commit 1 alone would leave a lint task pointing at a missing file; commit order matters and is enforced by the PR split.

## Open questions

None. All decisions are made in `/tmp/kz-brainstorm/brainstorm.md` Q1-Q9 and summarised above.
