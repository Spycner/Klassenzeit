# F-023: School Settings Redesign

## Description

The current School Settings section shows placeholder settings (lesson duration, break times, feature toggles) that:
1. Are saved to the database but **not used by any feature**
2. Don't reflect the actual complexity of school scheduling
3. May confuse users into thinking they're configuring something

Need to redesign this based on actual requirements from teachers/school administrators.

## Current State

The settings section currently has:
- Lesson duration (minutes)
- Break durations (short/long)
- Max periods per day
- Feature toggles (substitution management, parent portal) - **these features don't exist!**

All values are saved as JSON in `school.settings` but nothing reads them.

## Questions to Answer

Based on feedback from an actual teacher, school scheduling is more complex than anticipated. Need to research:

### Timing & Schedule Structure
- Do all lessons have the same duration? (Some schools have 45min, some 90min blocks, some mixed)
- How do breaks work? (Fixed times? After every X periods? Different on different days?)
- Do schedules differ by day of week?
- A/B week patterns? (Already in schema but not exposed)

### School-Specific Rules
- Maximum consecutive teaching hours for teachers?
- Required breaks between certain subjects?
- Room booking rules?
- Which subjects can be taught in which rooms?

### What Actually Varies Per School
- What settings genuinely differ between schools vs. what's universal?
- What's configured once vs. what changes per term/year?

## Acceptance Criteria

- [ ] Interview 1-2 teachers about what school settings they'd expect
- [ ] Document which settings actually affect timetabling
- [ ] Either remove placeholder settings OR implement real ones
- [ ] Add clear indication if settings don't affect app yet

## Options

1. **Remove settings section entirely** until features need them
2. **Keep minimal** - just the JSON editor for power users
3. **Implement properly** - but only settings that are actually used by timetabling solver

## Technical Notes

- Settings stored in `school.settings` as JSON (flexible schema)
- Backend: `School.java` has `settings` field (JSONB)
- Frontend: `SchoolSettingsSection.tsx` with form + JSON toggle
- Timetabling solver (Timefold) would be the consumer of these settings

## Related

- Timetable solver implementation (future)
- F-016: Time Slots Configuration
- F-017: Timetable Grid Views
