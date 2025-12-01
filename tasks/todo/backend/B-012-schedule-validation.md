# B-012: Schedule Validation

## Description
Implement validation for individual lessons and full schedules.

## Acceptance Criteria
- [ ] Implement pre-save validation for lessons
- [ ] Implement full schedule validation
- [ ] Add conflict detection (teacher, room, class overlaps)
- [ ] Add qualification verification
- [ ] Add availability checking
- [ ] Add capacity validation (room size vs. class size)

## Dependencies
- [B-010: Scheduling Constraints Model](B-010-scheduling-constraints-model.md)

## Blocks
None

## Notes
### API Endpoints
- `POST /api/schools/{id}/lessons/validate` - Validate single lesson
- `POST /api/schools/{id}/schedules/validate` - Validate full schedule
