# F-013: Subjects CRUD Pages

## Description

Implement the subjects management pages including list view and create/edit forms.

## Acceptance Criteria

- [ ] Create `pages/subjects/SubjectsListPage.tsx`:
  - [ ] Display subjects in DataTable
  - [ ] Show name, abbreviation, active status
  - [ ] "Add Subject" button
  - [ ] Row click navigates to detail
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/subjects/SubjectDetailPage.tsx`:
  - [ ] Form for create/edit subject
  - [ ] Fields: name, abbreviation, description, isActive
  - [ ] Delete confirmation for existing subjects

## Technical Details

### SubjectsListPage
```tsx
function SubjectsListPage() {
  const { data: subjects, isLoading, error, refetch } = useSubjects();
  const navigate = useNavigate();

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'abbreviation', header: 'Abbreviation' },
    { key: 'isActive', header: 'Status', cell: (row) => (
      <Badge variant={row.isActive ? 'default' : 'secondary'}>
        {row.isActive ? 'Active' : 'Inactive'}
      </Badge>
    )}
  ];

  // Standard list page pattern with PageHeader, DataTable, states
}
```

### SubjectDetailPage
```tsx
function SubjectDetailPage() {
  const { id } = useParams();
  const isNew = !id;

  // Standard detail page pattern:
  // - Load existing subject if editing
  // - Form with fields
  // - Create/Update mutations
  // - Delete with confirmation
}
```

### Form Fields
| Field | Type | Validation |
|-------|------|------------|
| name | text | Required, max 100 chars |
| abbreviation | text | Optional, max 10 chars |
| description | textarea | Optional, max 500 chars |
| isActive | checkbox | Default true |

### File Structure
```
pages/
  subjects/
    SubjectsListPage.tsx
    SubjectDetailPage.tsx
    components/
      SubjectForm.tsx (optional, can inline)
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useSubjects()` - List all subjects
- `useSubject(id)` - Get single subject
- `useCreateSubject()` - Create subject
- `useUpdateSubject()` - Update subject
- `useDeleteSubject()` - Delete subject

### Simpler than Teachers
Subjects have no sub-entities (unlike teachers with qualifications/availability), making this a simpler CRUD implementation.
