---
version: alpha
name: Klassenzeit PK
description: >
  Warm, editorial, slightly analog school-schedule UI. Moss-green primary,
  limestone neutral, broadsheet typography. Runtime source of truth is
  frontend/src/styles/app.css; hex values below are sRGB approximations of
  the authoritative oklch() tokens.
colors:
  primary: "#608c5e"
  secondary: "#7ba8bc"
  tertiary: "#d66c5d"
  neutral: "#fffcf5"
  surface: "#f9f4ec"
  on-surface: "#3a342f"
  muted: "#f1e9db"
  on-muted: "#7c7267"
  border: "#e8dfd1"
  accent: "#f5d1b0"
  error: "{colors.tertiary}"
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
  "2xl": 48px
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
  button-ghost:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
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
---

# Klassenzeit PK

## Overview

Klassenzeit is a scheduling workbench for German primary-school teachers and administrators (Grundschule staff, Schulleitung, sometimes a Sekretariat). The PK visual identity is built around that audience: warm, editorial, slightly analog. Moss carries the page's "go" beats, a limestone background stands in for the pulp paper of a grade book, and a Boston-clay orange handles attention and destructive axes. The effect should read as a well-made print artifact rather than a dashboard.

The UI should feel literal yet approachable: dense enough to show a week of lessons at a glance, but never austere. Real schedules are read by tired humans on a Monday morning; every card has generous internal padding, every label has enough air to breathe, and every data primitive (room codes, time stamps, IDs) uses a monospaced face so the eye can snap across rows. Body text sits in a warm sans-serif so the surrounding chrome reads as writing, not as telemetry.

Lean literary when the screen hosts long-form prose: settings, notes, release messages, empty-state explanations. Lean technical when the screen is tabular or grid-driven: schedule cells, calendar timestamps, placement ids, conflict diagnostics. The body-lg Lora tier exists specifically for the first case; the label-mono Fira Code tier exists specifically for the second. Mixing the two in a single viewport is fine and encouraged. Using Lora for a schedule cell is not.

## Colors

Runtime source of truth is `frontend/src/styles/app.css`; every hex here is an sRGB approximation of the authoritative `oklch()` token.

**primary** (`#608c5e`) maps to shadcn's `--primary`. Moss green, applied to the one CTA on a screen that we want the user to reach for: Save, Apply, Generate schedule. Never paint a whole page moss; the color earns its voltage by being rare.

**secondary** (`#7ba8bc`) maps to shadcn's `--secondary`. A dusty cornflower used for supporting actions, tab-switch pills, and chips that describe a stable state (a class, a room, a cohort). It reads as calm; next to the moss primary it reads as quiet.

**tertiary** (`#d66c5d`) maps to shadcn's `--destructive` and carries both destructive semantics (delete, remove, revert) and warning semantics (conflict toasts, validation callouts). There is one hot color in the system and this is it. The YAML alias `error` points to the same value so tooling can request either name.

**neutral** (`#fffcf5`) maps to shadcn's `--background`. The page itself: a warm off-white that reads as unbleached paper. Inputs also sit on `neutral` so text fields feel continuous with the page.

**surface** (`#f9f4ec`) maps to shadcn's `--card`. Cards, panels, dialog bodies, and anything that should sit one tonal step above the page. The step is intentionally small so elevation reads as depth-by-tone, not drop-shadow theater.

**on-surface** (`#3a342f`) maps to shadcn's `--foreground`. Body copy, headline copy, primary label color. A warm near-black (coffee-ink) instead of pure `#000` so text never looks stamped-on.

**muted** (`#f1e9db`) is the even-lower surface for read-only zones, disabled rows, and background chrome inside cards. It is quieter than `surface` but still on-palette.

**on-muted** (`#7c7267`) is the label color on muted regions and the secondary text color everywhere else: captions, metadata, table headers, helper text.

**border** (`#e8dfd1`) is the hairline that draws the edges of cards, inputs, tabs, and grids. Keep it as the only divider color; do not mix with raw `on-surface` at low alpha.

**accent** (`#f5d1b0`) is a warm peach held in reserve for highlight states, selected rows in a grid, and hover affordances on pale surfaces. It is deliberately under-used; shipping a view that paints half the screen in accent is a smell.

**Dark mode.** Dark mode swaps the entire palette to a deep-ink scheme authored directly in `app.css` and swaps `--font-mono` to Special Elite so technical tokens read as typewriter prints on dark paper. DESIGN.md captures light mode only because the current `alpha` schema has no dark-mode hook; treat `app.css` as authoritative for anything under `.dark`.

## Typography

**Quicksand** is the warm-sans workhorse. It carries `headline-lg` and `headline-md` for page and section titles, `body-md` and `body-sm` for general body copy, and `label-md` for button text, form labels, and short data labels. Quicksand's softly-rounded terminals keep the interface feeling friendly without tipping into cartoon; it is the single most-used face in the app.

**Lora** is reserved for `body-lg`: reading-heavy surfaces where we are asking the user to actually sit with a paragraph. Settings rationales, release-note bodies, onboarding copy, empty-state explanations longer than a sentence. Lora's mild slab flavor gives long-form text the broadsheet quality the brand is after without dragging a second whole face into short UI labels.

**Fira Code** is the technical voice, carried at `label-mono`. Schedule grid cells, timestamps, lesson ids, class codes, room codes, diagnostic output. Anything the user would scan vertically across rows belongs in mono; anything the user would read left-to-right as a sentence does not.

**Dark mode swaps mono to Special Elite** (see `app.css`), replacing Fira Code with a typewriter face so technical data reads as a carbon-copied printout on dark paper. The sans and serif tiers are unchanged across modes.

## Layout

Spacing uses an 8px scale exposed through the `spacing` YAML tokens: `xs=4px`, `sm=8px`, `md=16px`, `lg=24px`, `xl=32px`, `2xl=48px`. Every padding, gap, and inset in the product should land on one of those values; Tailwind's stock 1-unit steps incidentally satisfy this because `1 = 4px`.

Grouping is card-based: related content sits inside a surface-tinted container with `spacing.lg` (24px) of internal padding, and cards are separated from each other by `spacing.md` (16px) in dense views or `spacing.lg` in reading views. Cards do not nest deeper than one level; if a second level looks unavoidable, introduce a tab bar or collapse the inner group.

Desktop layouts cap at a 1200px max-width content frame, centered inside the page with generous gutters. Below the 1200px breakpoint the layout fluidly reflows; schedule grids scroll horizontally before they squeeze, and card columns collapse to a single column at roughly 768px. Touch targets stay at or above `spacing.xl` (32px) per axis even on desktop.

## Elevation & Depth

The system has four elevation levels: `0` flat (the page itself), `1` default (cards sitting on the page), `2` raised (popovers, menus, hover-lifted rows), `3` overlay (modals, sheets, command palette). In light mode each step is a warm-brown drop shadow at low alpha, roughly `0 4px 12px` at level 1 and progressively larger and softer for 2 and 3; never use pure black. In dark mode the same ramp switches to pure-black dramatic shadows authored in `app.css` for contrast against deep-ink surfaces.

Depth is secondary to tonal layering: the primary cue that a card sits above the page is that `surface` is a tonal step above `neutral`, not that it casts a shadow. Shadows exist to separate interactive elements from static ones (a popover from a card) and to reinforce focus states. Never use a shadow to compensate for a missing tonal step.

## Shapes

The CSS base is `--radius: 1rem`, and the `rounded` YAML ladder derives from it: `sm=12px`, `md=14px`, `lg=16px`, `xl=20px`, `full=9999px`. Buttons and inputs take `md`, cards take `lg`, sheets and modals take `xl`, pills and avatars take `full`. The `sm` step is reserved for inline chips and very dense chrome.

The identity goal is "soft but deliberate": large enough that a card feels approachable and a button feels tactile, small enough that a card never looks like a pill-shaped button and a button never looks like a toast. A single viewport should pick one step of the ladder per element class and stick with it; a dialog that mixes `md` and `xl` radii reads as a bug.

## Components

**button-primary** is the single most-important call to action on a screen: Save, Generate, Apply. Moss green fill, white text, `rounded.md`, `label-md` typography. One per visible area; more than one and they compete.

**button-primary-hover** is the hover-state background step, a slightly darker moss (`#547a52`). It is modelled as its own component block so the hover deltas are inspectable without reading CSS.

**button-secondary** is for supporting actions alongside or underneath a primary: Cancel, Back, tab-switch, alternative flows. Dusty-blue fill, white text, same `rounded.md` and padding as primary so they pair cleanly. Usage note: white on the current secondary hex is 2.57:1, below WCAG AA at every size; treat this as existing UI debt, prefer large-text contexts until the palette is tuned, and track the fix as a follow-up rather than silently shipping the violation.

**button-ghost** is the tertiary level: toolbar actions, icon-only controls, row-level affordances inside dense tables. Neutral page background, on-surface text, same `rounded.md` and padding as the filled variants so ghost and filled line up on the same row.

**card** is the content container. Warm surface background, on-surface text, `rounded.lg`, `spacing.lg` (24px) of internal padding. The pairing of `surface` and `on-surface` is the single most-repeated contrast in the product; preserve it when extending.

**input** covers single-line text inputs, textareas, and select triggers. Neutral background so inputs feel continuous with the page, on-surface text, `rounded.md`, 10px padding, border drawn from `border`. Disabled inputs drop to `muted`/`on-muted` rather than lowering alpha.

## Do's and Don'ts

- Do: use `button-primary` for exactly one primary CTA per screen, so the user always knows where the default action lives.
- Do: maintain WCAG AA contrast where possible, and when a token is below AA (see the secondary-button note), track it as a follow-up rather than shipping a silent violation.
- Do: update this file and `frontend/src/styles/app.css` in the same commit whenever you change a semantic token, so DESIGN.md never drifts from the runtime source of truth.
- Don't: introduce new palette colors in CSS without also adding them here; an un-described color is a color nobody can reason about from outside the repo.
- Don't: mix radii across a single view; pick one ladder step per element class and stay with it.
- Don't: use `!important` or inline hex values in components; reach for the semantic token every time.
- Don't: author dark-mode tokens in this file; dark mode is authored in `app.css` and will stay there until the DESIGN.md schema supports a dark-mode hook.
