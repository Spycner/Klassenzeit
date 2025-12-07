# F-024: Improve API Hooks Test Coverage

## Priority: MEDIUM

## Description

Many API hooks have 0% test coverage. These hooks are critical for data fetching and mutations throughout the application.

## Acceptance Criteria

- [ ] Add tests for all untested hooks
- [ ] Achieve 80%+ coverage on API hooks
- [ ] Test error handling scenarios
- [ ] Test loading and success states

## Current Coverage

| Hook | Coverage | Status |
|------|----------|--------|
| use-classes.ts | 0% | Needs tests |
| use-lessons.ts | 0% | Needs tests |
| use-memberships.ts | 0% | Needs tests |
| use-rooms.ts | 0% | Needs tests |
| use-school-years.ts | 0% | Needs tests |
| use-terms.ts | 0% | Needs tests |
| use-time-slots.ts | 0% | Needs tests |
| use-teachers.ts | 14% | Needs more tests |
| use-subjects.ts | 24% | Needs more tests |
| use-schools.ts | 86% | Good |
| use-solver.ts | 100% | Complete |
| use-users.ts | 100% | Complete |

## Tasks

### 1. Create test files for untested hooks

For each hook, create a test file following the pattern in `use-schools.test.tsx`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClasses, useCreateClass, useUpdateClass, useDeleteClass } from './use-classes';

// Test queries
describe('useClasses', () => {
  it('fetches classes for a school', async () => {
    // ...
  });

  it('handles loading state', () => {
    // ...
  });

  it('handles error state', async () => {
    // ...
  });
});

// Test mutations
describe('useCreateClass', () => {
  it('creates a class successfully', async () => {
    // ...
  });

  it('invalidates cache on success', async () => {
    // ...
  });
});
```

### 2. Priority order

1. `use-memberships.ts` - Used in school settings, critical for access control
2. `use-classes.ts` - Core CRUD functionality
3. `use-rooms.ts` - Core CRUD functionality
4. `use-teachers.ts` - Expand existing tests
5. `use-subjects.ts` - Expand existing tests
6. `use-lessons.ts` - Core scheduling functionality
7. `use-time-slots.ts` - Scheduling configuration
8. `use-terms.ts` - School year configuration
9. `use-school-years.ts` - School year configuration

### 3. Update MSW handlers

Add mock handlers for all API endpoints in `frontend/src/test/mocks/handlers.ts`

## Notes

- Use existing test patterns from `use-schools.test.tsx` and `use-users.test.tsx`
- Mock API responses using MSW
- Test both success and error scenarios

## Related Tasks

- [F-008: Optimistic Updates](./F-008-optimistic-updates.md) - add tests when implementing
