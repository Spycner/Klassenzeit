# 0011: Subject color and simplified room suitability

Status: Accepted
Date: 2026-04-20

## Context

Two adjacent data-model gaps in the scheduling domain:

1. Subject swatches were client-derived from a hash over the UUID, with no way for admins to pick a color and no stability across re-creations.
2. The `rooms.suitability_mode` flag flipped the meaning of the `RoomSubjectSuitability` join table (`general` treated the list as exclusions; `specialized` treated it as inclusions). The feature had no frontend surface, no solver consumer, and the inversion logic was opaque to anyone reading the code cold.

## Decision

Add a required `color` column on `subjects`, stored either as a palette key (`chart-1` through `chart-12`) or a six-digit hex literal. Extend the CSS palette from 5 to 12 tokens to cover typical school catalogues.

Drop `rooms.suitability_mode`. The `RoomSubjectSuitability` join now always means "this room is suitable for this subject." Validity becomes a both-sides-gated rule:

1. The room's suitable-list is empty, or it contains the subject.
2. No room lists this subject, or this room is one of those.

In plain English: a room without any listings accepts any subject; a room that lists subjects is restricted to those; a subject that no room lists can go anywhere; a subject that some rooms list can only go in those. Worked examples:

| Subject | Room | Room's list | Rooms listing subject | Valid? |
| --- | --- | --- | --- | --- |
| PE | Gym | `[PE, Sport]` | `{Gym}` | yes |
| PE | Classroom | `[]` | `{Gym}` | no |
| Maths | Classroom | `[]` | `{}` | yes |
| Maths | Gym | `[PE, Sport]` | `{}` | no |

Enforcement lives in application logic. The solver is still a skeleton; it will consume this rule when it grows a scheduling pass.

Proactive validation: `PUT /rooms/{id}/suitability` now returns HTTP 400 with a typed `missing_subject_ids` payload on unknown IDs, rather than the previous integrity-error-derived 409.

## Why token keys over hex for the default

Token keys resolve to CSS custom properties at render time, so dark-mode re-skins and any future palette shift happen without a data migration. The hex escape hatch stays available for users who need off-palette colors.

## Scope boundaries

No solver enforcement yet. No subject-side "allowed rooms" editor (room is the authoring side). No bulk import/export that carries color. Color collisions above 12 subjects are acceptable at current school scale; the custom hex input covers users who want to break the tie.

## Consequences

Positive:
- One rule, one storage shape, one direction of edit. Readers can answer "where does PE belong?" with a single table look-up instead of mode-dependent interpretation.
- Frontend renders a persisted palette slot; re-creating a subject no longer churns the color.
- Typed 400 errors let the UI keep the edit dialog open and surface which IDs went missing, instead of a generic 409 toast.

Negative:
- Any existing `RoomSubjectSuitability` row on a general-purpose room (previously meaning "excluded") silently reverses meaning. The migration left the data intact; staging had no such rows at the time of this change.
- Two-request room save flow (POST or PATCH, then PUT suitability). On PUT failure the base row persists; the UI leaves the dialog open for the user to retry.
