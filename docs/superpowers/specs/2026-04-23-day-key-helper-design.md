# `dayShortKey` / `dayLongKey` i18n helper

**Date:** 2026-04-23
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

Three React components cast a numeric day-of-week index back to a typed i18n key to render the weekday column header for a grid:

- `frontend/src/features/week-schemes/week-schemes-page.tsx:161` — `` t(`common.daysShort.${day as 0 | 1 | 2 | 3 | 4}`) ``.
- `frontend/src/features/teachers/teacher-availability-grid.tsx:134,147` — `` t(`common.daysShort.${d}` as "common.daysShort.0") `` and the matching `daysLong` cast.
- `frontend/src/features/rooms/room-availability-grid.tsx:98,111` — identical pair.

`frontend/src/features/week-schemes/time-blocks-table.tsx:52` already defines an inline `longDayKey(day: number)` plus its own private `DAY_KEYS` / `DayKey` aliases. The long-day pattern has drifted into a local helper; the short-day pattern still reaches for `as` assertions on every call site.

`frontend/CLAUDE.md` forbids `as Foo` assertions where a type guard or helper would narrow. The casts are load-bearing today only because there is no shared helper to replace them. With the upcoming schedule-view step (see `docs/superpowers/OPEN_THINGS.md` > "Prototype sprint" > step 1) about to add a fourth consumer of typed day keys, the casts will multiply if the helper does not land first.

`docs/superpowers/OPEN_THINGS.md` > "Pay down alongside the sprint" explicitly names this work:

> Extract `dayShortKey(n: number)` helper before step 1. Multiple features (`week-schemes-page.tsx`, `teacher-availability-grid.tsx`, `time-blocks-table.tsx`) cast a numeric day index back to a `0 | 1 | 2 | 3 | 4` literal to satisfy typed i18n. Move the cast into a single helper (e.g. `i18n/day-keys.ts` exporting `dayShortKey(n: number)` returning the typed literal or throwing on out-of-range) so the new schedule view uses it from day one instead of adding a fourth cast, and the `frontend/CLAUDE.md` "No `as Foo` assertions" rule holds at call sites.

The `Roadmap status` auto-memory points to the same item as the next tidy-first task before the schedule view.

## Goal

Ship one new module `frontend/src/i18n/day-keys.ts` exporting two pure helpers:

- `dayShortKey(day: number): `common.daysShort.${DayKey}``
- `dayLongKey(day: number): `common.daysLong.${DayKey}``

Both validate that `day` is an integer in `[0, 4]` and throw `RangeError` otherwise. Migrate all four cast call sites and retire the inline `longDayKey` / `DAY_KEYS` / `DayKey` aliases in `time-blocks-table.tsx`. Colocated `day-keys.test.ts` covers the happy path and the throw branch.

## Non-goals

- **Extending `DayKey` beyond `0..4`.** Klassenzeit is a Monday-through-Friday app today. If Saturday or Sunday ever enter the domain (weekend clubs, Samstagsunterricht), the helper gets a second parameter or a new sibling function. Not now.
- **Exporting `DAY_KEYS` or `DayKey` to callers.** No caller outside the helper module needs either. Public surface is deliberately narrow. If a future caller (e.g. the schedule view's column header component) genuinely needs the type, export it in the same PR that adds the first consumer.
- **Replacing the typed `t()` infrastructure.** `frontend/src/i18n/types.d.ts` already generates literal-key types from `en.json`; the helper rides on top of that, it does not replace it. The broader "No template-literal keys" rule in `frontend/CLAUDE.md` remains in force for keys whose dynamic part is not a bounded integer domain.
- **Adding an ESLint / Biome rule that flags `as "common.daysShort.*"` literals.** Worth discussing separately if casts creep back, but a one-off lint for a five-element domain is premature. Revisit if a second helper-worthy pattern appears.
- **ADR.** Extracting one helper does not change architecture. No ADR.
- **Touching `daysShort` / `daysLong` keys in the i18n catalogs.** Keys and translations are unchanged; this is a rendering-path refactor.

## Design

### File location and public API

Single new file at `frontend/src/i18n/day-keys.ts`:

```ts
const DAY_KEYS = ["0", "1", "2", "3", "4"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function assertDayKey(day: number): DayKey {
  if (!Number.isInteger(day) || day < 0 || day > 4) {
    throw new RangeError(`day must be an integer in [0, 4], got ${day}`);
  }
  return String(day) as DayKey;
}

export function dayShortKey(day: number): `common.daysShort.${DayKey}` {
  return `common.daysShort.${assertDayKey(day)}`;
}

export function dayLongKey(day: number): `common.daysLong.${DayKey}` {
  return `common.daysLong.${assertDayKey(day)}`;
}
```

- `DAY_KEYS` and `DayKey` stay module-private.
- `assertDayKey` is module-private; the two exported helpers call it.
- Return types are template-literal strings typed against `en.json`, so `t(dayShortKey(d))` type-checks without call-site casts.
- `Number.isInteger(day)` rejects `NaN`, `Infinity`, and non-integer floats in one predicate.

Location rationale: `frontend/src/i18n/` already holds `config.ts`, `init.ts`, and `types.d.ts`. The helper is tightly coupled to i18n keys and belongs next to its peers. `lib/` is for general-purpose utilities; `features/common/` does not exist and creating it for one helper is overkill.

### Call-site migrations

Four cast sites + one inline helper. Replacement is mechanical and behavior-preserving:

| File | Line | Before | After |
| --- | --- | --- | --- |
| `features/week-schemes/week-schemes-page.tsx` | 161 | `` t(`common.daysShort.${day as 0 \| 1 \| 2 \| 3 \| 4}`) `` | `t(dayShortKey(day))` |
| `features/teachers/teacher-availability-grid.tsx` | 134 | `` t(`common.daysShort.${d}` as "common.daysShort.0") `` | `t(dayShortKey(d))` |
| `features/teachers/teacher-availability-grid.tsx` | 147 | `` t(`common.daysLong.${d}` as "common.daysLong.0") `` | `t(dayLongKey(d))` |
| `features/rooms/room-availability-grid.tsx` | 98 | `` t(`common.daysShort.${d}` as "common.daysShort.0") `` | `t(dayShortKey(d))` |
| `features/rooms/room-availability-grid.tsx` | 111 | `` t(`common.daysLong.${d}` as "common.daysLong.0") `` | `t(dayLongKey(d))` |
| `features/week-schemes/time-blocks-table.tsx` | 48-55, 230 | local `DAY_KEYS` / `DayKey` / `longDayKey` + `` t(`common.daysLong.${key}`) `` | delete locals, import `dayLongKey`, call `t(dayLongKey(day))` |

Each migration is an inline edit at the call site plus an added `import { dayShortKey, dayLongKey } from "@/i18n/day-keys";`. `time-blocks-table.tsx` additionally drops the four-line local helper and its two supporting aliases.

### Tests

New colocated unit test at `frontend/src/i18n/day-keys.test.ts` using Vitest:

- **Happy path:** iterate `[0, 1, 2, 3, 4]` and assert the returned strings match the expected `` `common.daysShort.${n}` `` / `` `common.daysLong.${n}` ``.
- **Throw branch:** assert `dayShortKey(-1)`, `dayShortKey(5)`, `dayShortKey(1.5)`, `dayShortKey(Number.NaN)` each throw `RangeError`. Same set for `dayLongKey`.

No existing component test changes. The rendered DOM for `teacher-availability-grid`, `room-availability-grid`, `week-schemes-page`, and `time-blocks-table` is identical before and after; their existing assertions keep passing.

### Lint and type-check expectations

- `Number.isInteger` is part of ES2015 and already available in the TS lib; no `tsconfig` change.
- `erasableSyntaxOnly: true` in `tsconfig.json` is satisfied: the `DAY_KEYS` const is not an enum, and the `DayKey` type alias is erasable.
- `noUncheckedIndexedAccess: true` is satisfied: the helper does not index into anything dynamic.
- `biome`'s `noNonNullAssertion` is satisfied: no `!`. The `as DayKey` inside `assertDayKey` is deliberate and narrow (after the range check, the value is demonstrably a member of `DAY_KEYS`), and is the one `as` that survives. This is the only place the cast lives.

### Behavior preservation

Rendered labels for the existing call sites are unchanged because:

1. The rendered string comes from `t()`, and the key passed to `t()` is string-identical to the prior cast expression.
2. No caller currently passes a value outside `[0, 4]`. `teacher-availability-grid.tsx` and `room-availability-grid.tsx` iterate `[0, 1, 2, 3, 4] as const`; `week-schemes-page.tsx` iterates `daysPresent` which is built from `time_blocks` whose `day_of_week` is backend-validated in `[0, 4]`; `time-blocks-table.tsx` iterates over `day_of_week` values from the same source.
3. Existing component tests assert rendered day labels; any accidental regression surfaces there.

The `RangeError` branch is latent for current callers. It exists so a future caller that bypasses the pre-filter gets a loud failure instead of a silent mis-translation.

## Implementation order

Three commits on branch `refactor/day-key-helper`:

1. `docs: add day-key helper design spec` — this file.
2. `docs: add day-key helper implementation plan` — the plan at `docs/superpowers/plans/2026-04-23-day-key-helper.md`.
3. `refactor(frontend): extract dayShortKey/dayLongKey i18n helper` — the new module, its test, the four call-site migrations, and the removal of the inline helper, as one atomic structural change.

A single implementation commit is consistent with `.claude/CLAUDE.md`'s tidy-first rule: the change is pure structural. No behavior commit is mixed in.

The resolved bullet in `docs/superpowers/OPEN_THINGS.md` (the multi-line "Extract `dayShortKey(n: number)` helper" entry under "Pay down alongside the sprint") is removed in the same refactor commit, since the bullet exists only to gate the refactor and its removal is not independently meaningful.

## Risks

- **`t()` does not accept the template-literal return type.** Already proven out by the existing `longDayKey` helper in `time-blocks-table.tsx`, which returns the same shape and is consumed by `t()`. Low risk.
- **A future caller passes an out-of-range value.** Weekdays in this app run Monday to Friday; the backend validates `day_of_week ∈ [0, 4]`. If Saturday or a lint error introduces a 5 or 6 temporarily, the `RangeError` surfaces at call time instead of silently mis-translating. Tradeoff accepted.
- **The test file adds to frontend coverage and might trip the ratchet.** Coverage delta is positive (new code with near-100% coverage). No risk of downward drift.
- **`assertDayKey`'s `as DayKey` cast survives.** That is intentional — the runtime check proves membership, and this is exactly the place a narrow cast earns its keep. `frontend/CLAUDE.md` forbids `as Foo` "where a type guard or discriminated union would narrow"; here the cast is the narrowing point itself, with the runtime validation immediately preceding it.

## Follow-ups (not this PR)

- **Schedule view.** Sprint step 1. Will consume `dayShortKey` / `dayLongKey` from day one.
- **Hessen Grundschule seed.** Sprint step 2. Independent of this refactor.
- **Playwright E2E smoke.** Sprint step 3. Independent.
- **`DayKey` export.** Speculative. Add the export the same commit as the first consumer requests it.
- **Lint rule against `as "common.days(Short|Long).0"` literals.** Only if the casts creep back in review.
