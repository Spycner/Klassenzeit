# F-014: Rooms CRUD Pages

## Description

Implement the rooms management pages including list view and create/edit forms.

## Acceptance Criteria

- [ ] Create `pages/rooms/RoomsListPage.tsx`:
  - [ ] Display rooms in DataTable
  - [ ] Show name, capacity, active status
  - [ ] "Add Room" button
  - [ ] Row click navigates to detail
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/rooms/RoomDetailPage.tsx`:
  - [ ] Form for create/edit room
  - [ ] Fields: name, capacity, features, isActive
  - [ ] Delete confirmation for existing rooms

## Technical Details

### RoomsListPage
```tsx
function RoomsListPage() {
  const { data: rooms, isLoading, error, refetch } = useRooms();
  const navigate = useNavigate();

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'capacity', header: 'Capacity' },
    { key: 'isActive', header: 'Status', cell: (row) => (
      <Badge variant={row.isActive ? 'default' : 'secondary'}>
        {row.isActive ? 'Active' : 'Inactive'}
      </Badge>
    )}
  ];

  // Standard list page pattern
}
```

### Form Fields
| Field | Type | Validation |
|-------|------|------------|
| name | text | Required, max 100 chars |
| capacity | number | Optional, positive integer |
| features | multi-select/tags | Optional, JSON array |
| isActive | checkbox | Default true |

### Features Field
Room features are stored as JSON. UI options:
- Simple: Comma-separated text input
- Better: Tag input component (add/remove tags)

Example features: `["projector", "whiteboard", "computers", "lab_equipment"]`

### File Structure
```
pages/
  rooms/
    RoomsListPage.tsx
    RoomDetailPage.tsx
    components/
      RoomForm.tsx (optional)
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useRooms()` - List all rooms
- `useRoom(id)` - Get single room
- `useCreateRoom()` - Create room
- `useUpdateRoom()` - Update room
- `useDeleteRoom()` - Delete room

### Features JSON Handling
The backend stores features as JSONB. The frontend should:
- Parse JSON string to array for display
- Convert array back to JSON for API calls
