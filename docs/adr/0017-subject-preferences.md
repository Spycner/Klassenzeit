# 0017: Subject-level pedagogy preferences

Date: 2026-04-29
Status: Accepted
Supersedes: none
Superseded-by: none

## Context

The solver's soft-constraint surface after PR-9a (gap-counting infrastructure) and PR-9b (LAHC) carries only structural axes (`class_gap`, `teacher_gap`). Real-world Hessen Grundschule complaints map to per-subject pedagogy axes: "Hauptfächer früh", "Sport nicht in der ersten Stunde". Without subject-level scoring axes, LAHC's local search has nothing to chase past compactness; PR-9b's bench numbers showed `Soft score = 0/0` and `2/2` precisely because the gap-only weights produce a single-Change-move local minimum on the seed fixtures.

## Decision

PR-9c adds two orthogonal subject-level soft-constraint axes:

1. `Subject.prefer_early_periods: bool` plus `ConstraintWeights.prefer_early_period: u32`. Per-placement penalty is `tb.position * weight` for flagged subjects.
2. `Subject.avoid_first_period: bool` plus `ConstraintWeights.avoid_first_period: u32`. Per-placement penalty is `weight` if `tb.position == 0` for flagged subjects.

`solve()`'s active default is `1` for each new weight; `ConstraintWeights::default()` keeps zeros. The two flags live as direct fields on the `Subject` struct (Rust + ORM + Pydantic + Zod), not on a join-table or an enum. `score_solution` adds a per-placement loop after the existing partition logic; LAHC and the lowest-delta greedy share a single `pub(crate) fn subject_preference_score` helper that is allocation-free and `O(1)` per call.

## Consequences

### Positive

- LAHC's local search has new per-subject axes to chase; soft-score reduction becomes visible on bench fixtures.
- Schools express the most common pedagogy rules ("Hauptfächer früh", "Sport nicht zuerst") through the existing CRUD UI without any code change.
- Adding a third axis later is a one-field extension on `Subject` plus a matching weight, not a schema rewrite.
- Active defaults keep production callers unchanged from the previous release: `solve()` continues to optimise both gap and pedagogy axes with weight 1 each.

### Negative

- Wire format breakage: any external consumer of the `Problem` JSON must pass the two new fields. Mitigated by the same-PR backend update.
- Per-placement scoring loop adds `O(placements)` work to `score_solution` and `try_place_hour`'s candidate evaluation. Mitigated by hoisting the subject lookup once per solve.
- Boolean flags do not express "Mathematik is more strongly early than Deutsch". When that need surfaces, the booleans become weights; covered by the "configurable per-subject weights" follow-up.

### Considered alternatives

- **Single enum `preference_kind`.** Rejected because the two axes are orthogonal: a subject could plausibly want both ("Hauptfach but also not first slot"). Enum forces a single choice.
- **Join table `subject_preferences(subject_id, kind)`.** Rejected as schema overhead for what is conceptually a 1:1 property of Subject.
- **Linear `tb.position * weight` for avoid-first too.** Rejected because the real-world rule is binary ("Sport at 08:00 is bad"), not graded.

## References

- Spec: `docs/superpowers/specs/2026-04-28-subject-preferences-design.md`.
- OPEN_THINGS sprint item #9c.
- ADR 0013 (typed violations), 0014 (SolveConfig), 0015 (LAHC) for the surrounding solver-quality sprint.
