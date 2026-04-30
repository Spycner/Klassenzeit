# 0021: Many-to-many Lesson school classes

- **Status:** Accepted
- **Date:** 2026-04-30

## Context

The prototype's `Lesson.school_class_id` was a single FK because every lesson
served exactly one class. The "Realer Schulalltag" sprint introduces
parallel-Religion groups in which one Lesson serves multiple Klassen of the
same Jahrgang; the kath / ev / Ethik trio per Jahrgang is the canonical case.
A single FK cannot represent this without duplicating the Lesson row, which
would also duplicate the placement row and break the "two classes get blocked
by one lesson" invariant the cross-class hard constraint depends on.

## Decision

Replace `Lesson.school_class_id` with a `lesson_school_classes` join table
(association object on the ORM side, mirroring `TeacherQualification` /
`RoomSubjectSuitability`). Add a nullable `lesson_group_id: UUID` column
to mark co-placed lesson groups; the algorithm-phase PR adds the constraint
that consumes it.

## Alternatives considered

- **Plain SQLAlchemy `Table()` for the join** without an ORM model. Rejected
  because the codebase consistently uses association objects for join tables;
  consistency wins over a marginally smaller import surface.
- **Postgres `school_class_ids: ARRAY(UUID)` column.** Rejected: arrays do
  not get FK enforcement, do not participate in `JOIN`, and the cross-class
  hard constraint in the next PR will need to filter by `school_class_id IN`,
  which is awkward against an array.
- **Two-phase migration** keeping the single FK while the join lands.
  Rejected: this is a prototype with one auto-deployed staging environment
  and no public schema.

## Consequences

- Lesson edit dialog gains a multi-select; CRUD endpoints adapt.
- Solver wire format flips: `school_class_id: UUID` becomes
  `school_class_ids: list[UUID]`. `validate_structural` enforces non-empty
  + unique + resolvable. The greedy and LAHC blocking loops iterate the
  list; for single-class lessons (most of them) the loop is one iteration
  and bench p50 stays within 1 to 2 percent of the single-FK baseline.
- The `(school_class_id, subject_id)` UNIQUE on `lessons` is dropped; a
  route-level pre-check replaces it with the same `409` semantics on
  `(subject, any-class-overlap)`.
- The existing `Lesson` model loses the `school_class` accessor; every
  caller flips to `school_classes` (a list).
- `lesson_group_id` is round-tripped end-to-end but not yet acted on by
  the solver; the algorithm-phase PR adds the lesson-group co-placement
  constraint and the `LessonGroupSplit` violation kind.
- The dreizuegige Grundschule seed (12 classes) ships in the same PR; it
  exercises both the multi-class shape and the lesson_group_id field.
  Until the lesson-group constraint lands, each member class of a
  cross-class Religion lesson is "blocked" at every member-lesson's
  placement, so the schedule reserves more class-slot time than a real
  parallel-Religion classroom would. This is documented (rather than
  fixed) because the algorithm-phase PR collapses the three placements
  into one shared time-block via the constraint.
