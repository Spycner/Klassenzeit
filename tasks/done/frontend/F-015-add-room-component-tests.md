# Add Unit Tests for Room CRUD Page Components

## Description
The rooms CRUD feature has excellent API-level testing (100% coverage for use-rooms hook) but missing page component tests. This mirrors the pattern from subjects CRUD - API testing is thorough but page-level integration testing needs attention.

## Acceptance Criteria
- [x] Create `RoomsListPage.test.tsx` with 10+ tests covering:
  - Renders room list with data
  - Displays loading state while fetching
  - Handles empty state when no rooms
  - Shows error state on fetch failure
  - Navigates to detail page on row click
  - Opens create dialog for new room
- [x] Create `RoomDetailPage.test.tsx` with 10+ tests covering:
  - Renders room form in create mode
  - Renders room form in edit mode
  - Loads room data from API
  - Displays loading/error states
  - Navigates to list on successful save
  - Shows delete confirmation dialog
- [x] Create `RoomForm.test.tsx` with 10+ tests covering:
  - Renders form fields (name, building, capacity)
  - Validates required fields
  - Submits form with valid data
  - Displays validation errors
- [x] Create `SubjectSuitabilitySection.test.tsx` with 10+ tests covering:
  - Renders subject suitability list
  - Shows empty state when no suitabilities
  - Adds subject suitability on form submit
  - Removes suitability on delete
- [x] All tests pass with `npm run test`
- [x] Coverage for room pages reaches 88%+

## Context
- Found by: frontend-tests agent
- Priority: MEDIUM
- Effort: Medium
- Related files:
  - `frontend/src/pages/RoomsListPage.tsx` (0% coverage)
  - `frontend/src/pages/RoomDetailPage.tsx` (0% coverage)
  - `frontend/src/pages/rooms/components/RoomForm.tsx` (0% coverage)
  - `frontend/src/pages/rooms/components/SubjectSuitabilitySection.tsx` (0% coverage)

## Notes
Follow the pattern from Subject CRUD tests:
- `frontend/src/pages/SubjectsListPage.test.tsx` (9 tests)
- `frontend/src/pages/SubjectDetailPage.test.tsx` (10 tests)
- `frontend/src/pages/SubjectForm.test.tsx` (10 tests)

## Completion Notes
Created comprehensive test suites for all room components:

1. **RoomsListPage.test.tsx** (10 tests):
   - Rendering with data, loading, empty state, error state
   - User interactions: row click navigation, add button
   - Capacity column, active/inactive badges, missing data handling

2. **RoomDetailPage.test.tsx** (14 tests):
   - Create mode: empty form, no delete button, no suitability section
   - Edit mode: pre-filled form, delete button, suitability section
   - CRUD operations: create, update, delete with confirmation dialog
   - Loading and 404 error states

3. **RoomForm.test.tsx** (15 tests):
   - Form rendering and pre-fill with existing data
   - Validation: required name field, capacity minimum
   - Submission with valid data, trimmed whitespace, optional fields
   - Button states during submission, cancel navigation

4. **SubjectSuitabilitySection.test.tsx** (14 tests):
   - Suitability pills with required badges
   - Empty and loading states
   - Add form: combobox, filtering already-assigned subjects, submit
   - Remove functionality with F-017 race condition fix verification

**Coverage achieved:**
- RoomsListPage: 100%
- RoomDetailPage: 97.22%
- RoomForm: 94.73%
- SubjectSuitabilitySection: 95.91%
- Overall pages/rooms/components: 95.58%

All 589 tests pass.
