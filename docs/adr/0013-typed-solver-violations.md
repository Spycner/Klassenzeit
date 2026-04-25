# 0013: Typed solver violations

- **Status:** Accepted
- **Date:** 2026-04-25

## Context

`solver-core` exposed `ViolationKind { NoQualifiedTeacher, UnplacedLesson }` plus
a free-form `message: String` on every `Violation`. The frontend rendered that
message verbatim through one i18n key, so the German UI shipped English copy
inside otherwise-German rows; violations could not be grouped, counted, or
filtered by reason; and the algorithm-phase sprint PRs (FFD, Doppelstunden,
LAHC) had no typed kind to dispatch on.

archive/v2 carried a richer enum (11 hard variants plus 4 soft) but most of those
describe failure modes the current greedy never produces (it pre-checks rather
than placing-then-diagnosing) and the soft kinds need an objective function
that lands later in the sprint.

## Decision

Replace `ViolationKind` with the four kinds the current greedy actually
distinguishes: `NoQualifiedTeacher`, `TeacherOverCapacity`, `NoFreeTimeBlock`,
`NoSuitableRoom`. Drop `message: String` from `Violation`. Use unit variants
only (no associated data on the wire). FastAPI `ViolationResponse` mirrors as
a `Literal[...]`. Frontend renders via a typed-key helper
(`src/i18n/violation-keys.ts`) and four per-kind i18n entries per locale.

## Alternatives considered

- **Mirror archive/v2 verbatim.** Ships dead variants and dead i18n strings
  for kinds the current solver never produces.
- **Tagged-union variants with associated data** (`TeacherOverCapacity { capacity: u8 }`).
  Adds Pydantic discriminated-union plumbing and TS narrowing cost for one
  variant's interpolated number we can fetch separately from `useTeachers()`.
- **Keep `message: String` for diagnostics.** Tempts callers to read the string
  instead of the kind; ~30 bytes per row on the wire; logs already record
  totals at the solve boundary.

## Consequences

- Wire contract is forward-only; producer (Rust solver) and consumer (frontend)
  ship in lockstep. Staging picks up the new shape on the next master push.
- Future variants land cheaply: add an enum case in `solver-core`, a literal
  in the Pydantic schema, a switch arm in `violation-keys.ts`, an i18n entry
  per locale.
- archive/v2 variants like `TeacherConflict`, `RoomCapacity` stay deferred
  until LAHC's local search introduces failure modes the greedy does not. Same
  for `severity` and `lesson_refs` / `resources` side data.
- Logs do not yet emit `violations_by_kind`; queued as a follow-up in
  `OPEN_THINGS.md`.
