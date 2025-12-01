# F-016: Time Slots Configuration Page

## Description

Implement the time slots configuration page that defines the school's daily schedule grid (periods, break times, start/end times).

## Acceptance Criteria

- [ ] Create `pages/timeslots/TimeSlotsPage.tsx`:
  - [ ] Display time slots in a weekly grid visualization
  - [ ] Show period number, start time, end time, break indicator
  - [ ] "Add Time Slot" button
  - [ ] Click slot to edit
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/timeslots/components/TimeSlotForm.tsx`:
  - [ ] Modal or inline form for create/edit
  - [ ] Fields: dayOfWeek, period, startTime, endTime, isBreak
- [ ] Create `pages/timeslots/components/TimeSlotGrid.tsx`:
  - [ ] Visual grid showing Mon-Fri x periods
  - [ ] Different styling for breaks vs lessons

## Technical Details

### TimeSlotsPage Layout
```
+----------------------------------------------------------+
| Time Slots                            [Add Time Slot]     |
+----------------------------------------------------------+
|        | Mon  | Tue  | Wed  | Thu  | Fri  |
+--------+------+------+------+------+------+
| 1      | 8:00-8:45  (same across all days typically)      |
| 2      | 8:50-9:35                                        |
| Break  | 9:35-9:55  (highlighted differently)             |
| 3      | 9:55-10:40                                       |
| ...    |                                                  |
+----------------------------------------------------------+
```

### TimeSlotGrid Component
```tsx
interface TimeSlotGridProps {
  timeSlots: TimeSlot[];
  onSlotClick: (slot: TimeSlot) => void;
}

function TimeSlotGrid({ timeSlots, onSlotClick }: TimeSlotGridProps) {
  // Group by period, show across days
  // Highlight breaks with different background
  // Click handler for editing
}
```

### Form Fields
| Field | Type | Validation |
|-------|------|------------|
| dayOfWeek | select | Required, 0-4 (Mon-Fri) |
| period | number | Required, 1-15 |
| startTime | time | Required, HH:MM format |
| endTime | time | Required, HH:MM format, after startTime |
| isBreak | checkbox | Default false |

### Bulk Creation Pattern
Schools often have the same periods across all days. Consider:
- "Apply to all days" option when creating a slot
- Template-based creation (e.g., "Standard German school schedule")

### File Structure
```
pages/
  timeslots/
    TimeSlotsPage.tsx
    components/
      TimeSlotGrid.tsx
      TimeSlotForm.tsx
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

- [F-017: Timetable Grid Views](F-017-timetable-views.md) (uses same grid pattern)

## Notes

### API Hooks Used
- `useTimeSlots()` - List all time slots
- `useTimeSlot(id)` - Get single time slot
- `useCreateTimeSlot()` - Create time slot
- `useUpdateTimeSlot()` - Update time slot
- `useDeleteTimeSlot()` - Delete time slot

### Typical German School Schedule
```
Period 1:  08:00 - 08:45
Period 2:  08:50 - 09:35
Break:     09:35 - 09:55
Period 3:  09:55 - 10:40
Period 4:  10:45 - 11:30
Break:     11:30 - 11:45
Period 5:  11:45 - 12:30
Period 6:  12:35 - 13:20
```

### UI Considerations
- Time inputs should be easy to use (time picker or formatted text input)
- Visual feedback when slots overlap or have gaps
- Clear distinction between lesson periods and breaks
