# F-012: Teachers CRUD Pages

## Description

Implement the teachers management pages including list view, create, edit, and related sub-entities (qualifications and availability).

## Acceptance Criteria

- [ ] Create `pages/teachers/TeachersListPage.tsx`:
  - [ ] Display teachers in DataTable
  - [ ] Show name, email, active status
  - [ ] "Add Teacher" button
  - [ ] Row click navigates to detail
  - [ ] Handle loading, empty, error states
- [ ] Create `pages/teachers/TeacherDetailPage.tsx`:
  - [ ] Form for create/edit teacher
  - [ ] Fields: firstName, lastName, email, maxHoursPerWeek, isActive
  - [ ] Delete confirmation for existing teachers
  - [ ] Qualifications section (existing teachers only)
  - [ ] Availability section (existing teachers only)
- [ ] Create `pages/teachers/components/TeacherForm.tsx`
- [ ] Create `pages/teachers/components/QualificationsSection.tsx`:
  - [ ] List teacher's subject qualifications
  - [ ] Add/remove qualifications
  - [ ] Qualification level dropdown
- [ ] Create `pages/teachers/components/AvailabilitySection.tsx`:
  - [ ] Weekly grid showing availability
  - [ ] Mark slots as AVAILABLE, PREFERRED, BLOCKED
  - [ ] Bulk actions for setting availability

## Technical Details

### TeachersListPage
```tsx
function TeachersListPage() {
  const { data: teachers, isLoading, error, refetch } = useTeachers();
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Manage your school's teaching staff"
        actions={<Button onClick={() => navigate('/teachers/new')}>Add Teacher</Button>}
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : teachers?.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teachers yet"
          description="Add your first teacher to get started"
          action={<Button>Add Teacher</Button>}
        />
      ) : (
        <DataTable
          data={teachers}
          columns={teacherColumns}
          onRowClick={(t) => navigate(`/teachers/${t.id}`)}
        />
      )}
    </div>
  );
}
```

### TeacherDetailPage
```tsx
function TeacherDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const { data: teacher, isLoading } = useTeacher(id, { enabled: !isNew });
  const createMutation = useCreateTeacher();
  const updateMutation = useUpdateTeacher();
  const deleteMutation = useDeleteTeacher();

  const handleSubmit = async (data: TeacherFormData) => {
    if (isNew) {
      const created = await createMutation.mutateAsync(data);
      navigate(`/teachers/${created.id}`);
    } else {
      await updateMutation.mutateAsync({ id, ...data });
    }
  };

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Teacher' : `${teacher?.firstName} ${teacher?.lastName}`}
        breadcrumbs={[
          { label: 'Teachers', href: '/teachers' },
          { label: isNew ? 'New' : 'Edit' }
        ]}
      />

      <TeacherForm
        teacher={teacher}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {!isNew && (
        <>
          <QualificationsSection teacherId={id} />
          <AvailabilitySection teacherId={id} />
        </>
      )}
    </div>
  );
}
```

### QualificationsSection
```tsx
interface QualificationsSectionProps {
  teacherId: string;
}

function QualificationsSection({ teacherId }: QualificationsSectionProps) {
  const { data: qualifications } = useTeacherQualifications(teacherId);
  const { data: subjects } = useSubjects();
  const addMutation = useAddTeacherQualification(teacherId);
  const removeMutation = useRemoveTeacherQualification(teacherId);

  // UI: List of subject badges with qualification level
  // Add: Select subject + level dropdown
  // Remove: X button on each qualification
}
```

### AvailabilitySection
Shows weekly grid (Mon-Fri, periods 1-10) where each cell can be:
- AVAILABLE (default, white)
- PREFERRED (green)
- BLOCKED (red)

Click to cycle through states, or use bulk actions.

### File Structure
```
pages/
  teachers/
    TeachersListPage.tsx
    TeacherDetailPage.tsx
    components/
      TeacherForm.tsx
      QualificationsSection.tsx
      AvailabilitySection.tsx
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useTeachers()` - List all teachers
- `useTeacher(id)` - Get single teacher
- `useCreateTeacher()` - Create teacher
- `useUpdateTeacher()` - Update teacher
- `useDeleteTeacher()` - Delete teacher
- `useTeacherQualifications(teacherId)` - List qualifications
- `useAddTeacherQualification(teacherId)` - Add qualification
- `useRemoveTeacherQualification(teacherId)` - Remove qualification
- `useTeacherAvailability(teacherId)` - List availability slots
- `useSetTeacherAvailability(teacherId)` - Set availability

### Form Validation
Basic HTML5 validation for MVP. Zod validation will be added in F-002.
