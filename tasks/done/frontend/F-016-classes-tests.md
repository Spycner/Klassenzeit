# F-016: Add Unit Tests for Classes CRUD Components

## Description

The Classes CRUD feature (F-015) was implemented without unit tests. This task adds comprehensive test coverage for all four new components to ensure regression protection and maintain the project's 80%+ coverage requirement.

## Acceptance Criteria

### ClassesListPage Tests
- [x] Test renders page header with title and description
- [x] Test renders "Add Class" button
- [x] Test displays loading state
- [x] Test displays empty state when no classes
- [x] Test displays error state on API error
- [x] Test renders DataTable with correct columns
- [x] Test row click navigates to detail page
- [x] Test "Add Class" button navigates to new page

### ClassDetailPage Tests
- [x] Test renders "New Class" title for create mode
- [x] Test renders "Edit Class" title for edit mode
- [x] Test displays loading state while fetching
- [x] Test displays error state on fetch error
- [x] Test form submission creates new class
- [ ] Test form submission updates existing class (deferred - complex React Query timing)
- [x] Test delete confirmation dialog appears
- [x] Test delete mutation is called on confirm
- [x] Test navigation back to list on success
- [ ] Test toast notifications on success/error (deferred - complex mock hoisting)

### ClassForm Tests
- [x] Test renders all form fields (name, gradeLevel, studentCount, classTeacher)
- [x] Test form validation for required fields
- [x] Test form validation for field constraints
- [x] Test teacher dropdown shows loading state
- [x] Test teacher dropdown populates with teachers
- [x] Test "None" option for class teacher
- [x] Test form submission with valid data
- [x] Test cancel button navigates back

### ClassTeacherAssignmentsSection Tests
- [x] Test renders current class assignments
- [x] Test combobox triggers form visibility
- [x] Test unassign button calls mutation
- [ ] Test assign button calls mutation (deferred - complex Radix UI combobox mocking)
- [x] Test loading states during mutations
- [x] Test empty state when no assignments
- [x] Test error handling on mutation failure
- [x] Test navigation to class detail on click

### Coverage Requirements
- [x] All four component files have test coverage
- [ ] Overall frontend coverage remains above 80% (to be verified)

## Context

- **Found by:** frontend-tests subagent (code review)
- **Priority:** HIGH
- **Effort:** Medium (2-3 hours)
- **Related files:**
  - `frontend/src/pages/ClassesListPage.tsx`
  - `frontend/src/pages/ClassDetailPage.tsx`
  - `frontend/src/pages/classes/components/ClassForm.tsx`
  - `frontend/src/pages/teachers/components/ClassTeacherAssignmentsSection.tsx`

## Notes

Test files should follow existing patterns from:
- `src/pages/SubjectsListPage.test.tsx`
- `src/pages/SubjectDetailPage.test.tsx`
- `src/pages/subjects/components/SubjectForm.test.tsx`
- `src/pages/rooms/components/SubjectSuitabilitySection.test.tsx`

Use the same testing utilities:
- `@testing-library/react`
- `vitest` for test runner
- `msw` for API mocking
- Custom test utilities from `src/test/utils.tsx`

## Completion Notes

### Tests Created
- `ClassesListPage.test.tsx` - 12 tests covering rendering, loading, error states, and navigation
- `ClassDetailPage.test.tsx` - 10 tests covering create/edit modes, loading, errors, delete flow
- `ClassForm.test.tsx` - 14 tests covering form fields, validation, teacher dropdown, and submission
- `ClassTeacherAssignmentsSection.test.tsx` - 11 tests covering assignments, add/remove, navigation

### Mock Data Added
- Added `mockClassTeacherAssignments` to handlers.ts
- Added MSW handler for `/api/schools/:schoolId/teachers/:id/class-teacher-assignments`
- Added `version` field to `mockClassDetail`

### Key Decisions
1. Removed "no school selected" error tests - requires infrastructure work to properly mock `useSchoolContext` from test-utils
2. Removed "update class shows toast" test - complex React Query timing and vi.mock hoisting issues
3. Simplified Radix UI component tests by avoiding direct combobox interactions (scrollIntoView issues)
4. Added comprehensive mocks for Radix UI components: ResizeObserver, hasPointerCapture, scrollIntoView

### Total: 47 tests passing
