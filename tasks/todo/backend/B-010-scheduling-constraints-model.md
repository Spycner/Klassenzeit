# B-010: Scheduling Constraints Model

## Description
Define constraint types and their parameters for the timetabling algorithm.

## Acceptance Criteria
- [ ] Define hard constraints (must be satisfied):
  - No teacher double-booking
  - No room double-booking
  - No class double-booking
  - Teacher must be qualified for subject
  - Teacher must be available (not blocked)
- [ ] Define soft constraints (preferences, scored):
  - Teacher preferred time slots
  - Minimize gaps in teacher schedules
  - Keep subjects spread across the week
  - Class teacher teaches first period
- [ ] Decide on data model approach (database vs code)

## Dependencies
None

## Blocks
- [B-011: Timetabling Algorithm](B-011-timetabling-algorithm.md)
- [B-012: Schedule Validation](B-012-schedule-validation.md)

## Notes
Data model options:
- Store constraints in database (flexible, user-configurable)
- Define constraints in code (simpler for v1)
