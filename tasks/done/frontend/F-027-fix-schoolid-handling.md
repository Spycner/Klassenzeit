# F-027: Fix schoolId Handling Edge Cases

## Priority: LOW

## Description

Address edge cases in schoolId handling identified during code review to prevent potential bugs.

## Acceptance Criteria

- [x] Fix empty string passed to hooks when schoolId is undefined
- [x] Validate localStorage schoolId before use
- [x] Add guards for mutation calls without valid schoolId

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

## Completion Notes

**Completed: 2025-12-07**

### Changes Made

1. **SchoolContext.tsx** - Added localStorage validation:
   - Validates saved schoolId against user's actual schools
   - Clears invalid localStorage entries when user loses school access
   - Clears localStorage when user has no schools

2. **TeachersListPage.tsx** - Fixed mutation hook parameters:
   - Changed `schoolId ?? ""` to `schoolId!` with comment explaining safety
   - Existing guards in handlers (`if (teacherToReactivate && schoolId)`) ensure mutations never execute with undefined schoolId

3. **TeacherDetailPage.tsx** - Fixed mutation hook parameters:
   - Changed `schoolId ?? ""` to `schoolId!` with comment explaining safety
   - Existing guard in handleSubmit (`if (!schoolId) { return; }`) ensures mutations never execute with undefined schoolId

4. **SchoolContext.test.tsx** - Added comprehensive tests:
   - Tests initialization with first school when localStorage is empty
   - Tests restoration from valid localStorage
   - Tests cleanup of invalid localStorage values
   - Tests clearing localStorage when user has no schools
   - Tests error handling when used outside provider

### Verification

- All 499 frontend tests pass
- TypeScript compilation succeeds
- Linter passes with no issues
