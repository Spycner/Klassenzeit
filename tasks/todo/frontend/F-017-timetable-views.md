# F-017: Timetable Grid Views

## Description

Implement the main timetable visualization page with multiple view perspectives (by class, by teacher, by room). This is the core view for seeing and understanding the schedule.

## Acceptance Criteria

- [ ] Create `pages/timetable/TimetablePage.tsx`:
  - [ ] Tabs for "By Class" | "By Teacher" | "By Room"
  - [ ] Selector dropdown for which entity to view
  - [ ] Weekly grid visualization
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/timetable/components/TimetableGrid.tsx`:
  - [ ] Weekly grid (Mon-Fri x periods)
  - [ ] Cells show lesson information
  - [ ] Support for A/B week patterns
- [ ] Create `pages/timetable/components/LessonCell.tsx`:
  - [ ] Display subject, teacher, room
  - [ ] Color coding (by subject or status)
  - [ ] Click to view/edit lesson details
- [ ] Add required shadcn/ui components:
  ```bash
  npx shadcn@latest add tabs select
  ```

## Technical Details

### TimetablePage Layout
```
+----------------------------------------------------------+
| Timetable                                                 |
+----------------------------------------------------------+
| [By Class] [By Teacher] [By Room]    [Class: 3a ▼]       |
+----------------------------------------------------------+
|        | Mon        | Tue        | Wed        | ...      |
+--------+------------+------------+------------+----------+
| 1      | Math       | German     | English    |          |
|        | Hr. Müller | Fr. Schmidt| Hr. Jones  |          |
|        | Room 101   | Room 102   | Room 103   |          |
+--------+------------+------------+------------+----------+
| 2      | German     | Math       | PE         |          |
|        | ...        | ...        | ...        |          |
+--------+------------+------------+------------+----------+
```

### TimetableGrid Component
```tsx
interface TimetableGridProps {
  lessons: Lesson[];
  timeSlots: TimeSlot[];
  viewType: 'class' | 'teacher' | 'room';
  entityId: string;
}

function TimetableGrid({ lessons, timeSlots, viewType, entityId }: TimetableGridProps) {
  // Filter lessons by view type and entity
  // Build grid with timeSlots as rows, days as columns
  // Handle empty cells and breaks
}
```

### LessonCell Component
```tsx
interface LessonCellProps {
  lesson: Lesson;
  viewType: 'class' | 'teacher' | 'room';
  onClick?: () => void;
}

function LessonCell({ lesson, viewType, onClick }: LessonCellProps) {
  // Show different info based on view type:
  // - Class view: subject, teacher, room
  // - Teacher view: subject, class, room
  // - Room view: subject, class, teacher

  // Handle A/B week indicator
  // Color coding by subject
}
```

### View-Specific Information Display
| View Type | Primary | Secondary | Tertiary |
|-----------|---------|-----------|----------|
| By Class | Subject | Teacher | Room |
| By Teacher | Subject | Class | Room |
| By Room | Subject | Class | Teacher |

### Week Pattern Display
For A/B week lessons:
- Show indicator (A) or (B) in cell
- Optional: Toggle to show only A-week, only B-week, or both

### File Structure
```
pages/
  timetable/
    TimetablePage.tsx
    components/
      TimetableGrid.tsx
      LessonCell.tsx
      LessonModal.tsx (optional, for viewing details)
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)
- [F-016: Time Slots Configuration](F-016-timeslots-config.md) (reuses grid pattern)

## Blocks

None

## Notes

### API Hooks Used
- `useLessons()` - List all lessons (filtered by class/teacher/room)
- `useTimeSlots()` - Get time slot grid structure
- `useSchoolClasses()` - For class selector
- `useTeachers()` - For teacher selector
- `useRooms()` - For room selector

### Color Coding Options
1. By subject (each subject has a color)
2. By status (conflicts in red, preferences in green)
3. By completeness (assigned vs unassigned)

### MVP Scope
- Read-only view for MVP
- Editing lessons will be handled in detail pages or future enhancement
- No drag-and-drop rescheduling (future feature)

### Future Enhancements
- Lesson editing modal (click cell to edit)
- Drag-and-drop rescheduling
- Conflict highlighting
- Export to PDF/image
- Print-friendly view
