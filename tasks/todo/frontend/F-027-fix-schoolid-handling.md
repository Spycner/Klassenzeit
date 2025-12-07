# F-027: Fix schoolId Handling Edge Cases

## Priority: LOW

## Description

Address edge cases in schoolId handling identified during code review to prevent potential bugs.

## Acceptance Criteria

- [ ] Fix empty string passed to hooks when schoolId is undefined
- [ ] Validate localStorage schoolId before use
- [ ] Add guards for mutation calls without valid schoolId

## Tasks

### 1. Fix TeachersListPage mutation hooks
**File:** `frontend/src/pages/TeachersListPage.tsx:49-50`

```typescript
// Before - passes empty string when schoolId undefined
const updateMutation = useUpdateTeacher(schoolId ?? "");
const permanentDeleteMutation = usePermanentDeleteTeacher(schoolId ?? "");

// After - only create mutations when schoolId exists
const updateMutation = useUpdateTeacher(schoolId!);
const permanentDeleteMutation = usePermanentDeleteTeacher(schoolId!);

// And ensure buttons/actions are disabled when !schoolId
```

### 2. Validate localStorage schoolId
**File:** `frontend/src/contexts/SchoolContext.tsx:61`

```typescript
// Before - trusts localStorage value
const savedSchoolId = localStorage.getItem(STORAGE_KEY);
setCurrentSchoolState(savedSchool);

// After - validate against user's actual schools
const savedSchoolId = localStorage.getItem(STORAGE_KEY);
const savedSchool = savedSchoolId
  ? user.schools.find((s) => s.schoolId === savedSchoolId)
  : null;
setCurrentSchoolState(savedSchool ?? user.schools[0] ?? null);

// Clear invalid localStorage value
if (savedSchoolId && !savedSchool) {
  localStorage.removeItem(STORAGE_KEY);
}
```

### 3. Review other pages for similar patterns

Check these files for similar issues:
- `SchoolDetailPage.tsx`
- `TeacherDetailPage.tsx`
- Other pages using schoolId from context

## Notes

- Low priority as these are edge cases
- Consider adding TypeScript strict null checks

## Related Tasks

- None
