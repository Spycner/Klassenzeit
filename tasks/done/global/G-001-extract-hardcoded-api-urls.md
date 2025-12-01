# G-001: Extract Hardcoded API URLs to Environment Variables

## Description
Move hardcoded API URLs in E2E tests to environment variables for flexibility.

## Acceptance Criteria
- [x] Create/update `e2e/.env.example` with API_BASE_URL
- [x] Update all E2E API test files to use environment variable
- [x] Pattern: `const API_BASE = process.env.API_BASE_URL || "http://localhost:8080/api";`

## Dependencies
None

## Blocks
- [G-002: Document Env Variables](G-002-document-env-variables.md)

## Notes
**Files to update:**
- `e2e/tests/api/schools.api.spec.ts`
- `e2e/tests/api/teachers.api.spec.ts`
- `e2e/tests/api/subjects.api.spec.ts`
- `e2e/tests/api/classes.api.spec.ts`
- `e2e/tests/api/rooms.api.spec.ts`

## Completion Notes
The E2E tests already had the environment variable pattern implemented in `e2e/tests/api/config.ts`:
```typescript
export const API_BASE = process.env.API_BASE_URL || "http://localhost:8080/api";
```

All test files import from this config. The only remaining work was to create `e2e/.env.example` to document the variable.
