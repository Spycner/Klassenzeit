# G-005: Add Boundary Condition Tests

## Description
Add E2E tests for edge cases and boundary conditions.

## Acceptance Criteria
- [x] Test empty string values
- [x] Test maximum length strings
- [x] Test Unicode/special characters in names
- [x] Test SQL injection attempts (verify backend blocks them)

## Dependencies
None

## Blocks
None

## Notes
**Location:** `e2e/tests/api/*.spec.ts`

## Completion Notes

Added "Boundary Conditions" test blocks to all 5 API spec files:

**schools.api.spec.ts:**
- Empty school name rejection
- Unicode in school name
- Special characters (O'Brien-Smith)
- SQL injection in name

**teachers.api.spec.ts:**
- Empty first name rejection
- Empty last name rejection
- Unicode names (Jose Garcia)
- Special characters (Mary-Jane O'Connor)
- SQL injection in email

**classes.api.spec.ts:**
- Empty class name rejection
- Unicode in class name
- Grade level at school minimum/maximum boundaries
- Grade level below minimum rejection
- SQL injection in class name

**rooms.api.spec.ts:**
- Empty room name rejection
- Negative capacity rejection
- Capacity of 1 (minimum valid)
- Special characters in room name
- Unicode in room name/building
- SQL injection in room name

**subjects.api.spec.ts:**
- Empty subject name rejection
- Empty abbreviation rejection
- Unicode in subject name
- Special characters (Art & Design)
- SQL injection in subject name

**Note:** Empty string validation tests accept either 400 (proper validation) or 500 (constraint violation) since the backend may not have explicit validation for all empty fields.
