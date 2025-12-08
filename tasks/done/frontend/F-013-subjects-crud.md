# F-013: Subjects CRUD Pages

## Description

Implement the subjects management pages including list view and create/edit forms.

## Acceptance Criteria

- [x] Create `pages/SubjectsListPage.tsx`:
  - [x] Display subjects in DataTable
  - [x] Show name, abbreviation, color (as colored dot + hex code)
  - [x] "Add Subject" button
  - [x] Row click navigates to detail
  - [x] Handle loading, empty, error states
- [x] Create `pages/SubjectDetailPage.tsx`:
  - [x] Form for create/edit subject
  - [x] Fields: name, abbreviation, color (with ColorPicker)
  - [x] Delete confirmation for existing subjects
- [x] Create reusable `ColorPicker` component
  - [x] Preset color palette (10 colors)
  - [x] Native color picker for custom colors
  - [x] Hex code input for manual entry
- [x] Add routes in App.tsx
- [x] Add translations (EN + DE)

## Technical Details

### SubjectsListPage
```tsx
function SubjectsListPage() {
  const { data: subjects, isLoading, error, refetch } = useSubjects(schoolId);
  const navigate = useNavigate();

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'abbreviation', header: 'Abbreviation' },
    { key: 'color', header: 'Color', cell: (row) => (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded border" style={{ backgroundColor: row.color }} />
        <span className="font-mono text-xs">{row.color}</span>
      </div>
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
| abbreviation | text | Required, max 10 chars |
| color | ColorPicker | Optional, hex color |

### File Structure
```
pages/
  SubjectsListPage.tsx
  SubjectDetailPage.tsx
  subjects/
    components/
      SubjectForm.tsx
      index.ts
components/ui/
  color-picker.tsx
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useSubjects(schoolId)` - List all subjects
- `useSubject(schoolId, id)` - Get single subject
- `useCreateSubject(schoolId)` - Create subject
- `useUpdateSubject(schoolId)` - Update subject
- `useDeleteSubject(schoolId)` - Delete subject

### Simpler than Teachers
Subjects have no sub-entities (unlike teachers with qualifications/availability), making this a simpler CRUD implementation.

### Backend Field Correction
The original task assumed fields `description` and `isActive`, but the actual backend Subject entity has `color` instead. Implementation follows the actual backend schema.

## Completion Notes

Implemented on 2025-12-07.

### Files Created
- `frontend/src/pages/SubjectsListPage.tsx` - List page with DataTable
- `frontend/src/pages/SubjectDetailPage.tsx` - Create/edit page
- `frontend/src/pages/subjects/components/SubjectForm.tsx` - Form component
- `frontend/src/pages/subjects/components/index.ts` - Exports
- `frontend/src/components/ui/color-picker.tsx` - Reusable ColorPicker component with preset palette, native picker, and hex input

### Files Modified
- `frontend/src/App.tsx` - Added routes for `/subjects`, `/subjects/new`, `/subjects/:id`
- `frontend/src/i18n/locales/en/pages.json` - Added subjects translations
- `frontend/src/i18n/locales/de/pages.json` - Added subjects translations (German)

### Files Deleted
- `frontend/src/pages/SubjectsPage.tsx` - Removed placeholder

### Patterns Followed
- List page pattern from `TeachersListPage.tsx`
- Detail page pattern from `TeacherDetailPage.tsx`
- Form component pattern from `TeacherForm.tsx`

### All Tests Pass
499 frontend unit tests passing.
