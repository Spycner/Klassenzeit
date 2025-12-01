# F-015: Classes CRUD Pages

## Description

Implement the school classes management pages including list view and create/edit forms.

## Acceptance Criteria

- [ ] Create `pages/classes/ClassesListPage.tsx`:
  - [ ] Display classes in DataTable
  - [ ] Show name, grade level, student count, active status
  - [ ] "Add Class" button
  - [ ] Row click navigates to detail
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/classes/ClassDetailPage.tsx`:
  - [ ] Form for create/edit class
  - [ ] Fields: name, gradeLevel, studentCount, isActive
  - [ ] Delete confirmation for existing classes

## Technical Details

### ClassesListPage
```tsx
function ClassesListPage() {
  const { data: classes, isLoading, error, refetch } = useSchoolClasses();
  const navigate = useNavigate();

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'gradeLevel', header: 'Grade' },
    { key: 'studentCount', header: 'Students' },
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
| name | text | Required, max 50 chars (e.g., "3a", "5b") |
| gradeLevel | number | Required, 1-13 |
| studentCount | number | Optional, positive integer |
| isActive | checkbox | Default true |

### File Structure
```
pages/
  classes/
    ClassesListPage.tsx
    ClassDetailPage.tsx
    components/
      ClassForm.tsx (optional)
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useSchoolClasses()` - List all classes
- `useSchoolClass(id)` - Get single class
- `useCreateSchoolClass()` - Create class
- `useUpdateSchoolClass()` - Update class
- `useDeleteSchoolClass()` - Delete class

### Naming Convention
German schools typically name classes by grade + letter (e.g., "3a", "3b", "5a"). The name field is free-form to accommodate different conventions.

### Student Count
Used by the solver to check room capacity constraints. Optional for MVP but important for accurate scheduling.
