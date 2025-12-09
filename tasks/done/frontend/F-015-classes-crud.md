# F-015: Classes CRUD Pages

## Description

Implement the school classes management pages including list view and create/edit forms.

## Acceptance Criteria

- [x] Create `pages/classes/ClassesListPage.tsx`:
  - [x] Display classes in DataTable
  - [x] Show name, grade level, student count, active status
  - [x] "Add Class" button
  - [x] Row click navigates to detail
  - [x] Handle loading, empty, error states
- [x] Create `pages/classes/ClassDetailPage.tsx`:
  - [x] Form for create/edit class
  - [x] Fields: name, gradeLevel, studentCount, classTeacher
  - [x] Delete confirmation for existing classes

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

## Completion Notes

### Implementation Date: 2025-12-08

### Files Created
1. `frontend/src/pages/ClassesListPage.tsx` - List page with DataTable
2. `frontend/src/pages/ClassDetailPage.tsx` - Create/edit page with form and delete confirmation
3. `frontend/src/pages/classes/components/ClassForm.tsx` - Form component with teacher dropdown
4. `frontend/src/pages/classes/components/index.ts` - Component exports

### Files Modified
1. `frontend/src/App.tsx` - Added routes for `/classes`, `/classes/new`, `/classes/:id`
2. `frontend/src/i18n/locales/en/pages.json` - Full English translations for classes
3. `frontend/src/i18n/locales/de/pages.json` - Full German translations for classes

### Files Deleted
1. `frontend/src/pages/ClassesPage.tsx` - Old placeholder page

### Key Decisions
- Added class teacher dropdown (optional) to form - fetches teachers using `useTeachers(schoolId)`
- Followed exact patterns from SubjectsListPage and SubjectDetailPage for consistency
- Used shadcn Select component for teacher dropdown with loading state handling
- All translations added for both EN and DE locales

### Verification
- TypeScript typecheck: PASSED
- Biome lint: PASSED (339 files checked)
