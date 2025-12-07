# F-025: Improve API Services Test Coverage

## Priority: MEDIUM

## Description

Most API service files have low test coverage (25-42%). These services handle the actual API calls and should be well-tested.

## Acceptance Criteria

- [ ] Add tests for all service functions
- [ ] Achieve 80%+ coverage on API services
- [ ] Test request formatting
- [ ] Test error handling

## Current Coverage

| Service | Coverage | Status |
|---------|----------|--------|
| classes.ts | 25% | Needs tests |
| lessons.ts | 25% | Needs tests |
| memberships.ts | 25% | Needs tests |
| rooms.ts | 25% | Needs tests |
| school-years.ts | 25% | Needs tests |
| terms.ts | 25% | Needs tests |
| time-slots.ts | 25% | Needs tests |
| teachers.ts | 42% | Needs more tests |
| subjects.ts | 63% | Needs more tests |
| schools.ts | 100% | Complete |
| solver.ts | 100% | Complete |
| users.ts | 100% | Complete |

## Tasks

### 1. Create test files for untested services

Follow the pattern in existing service tests:

```typescript
import { classesService } from './classes';
import { apiClient } from '../client';

vi.mock('../client');

describe('classesService', () => {
  describe('getAll', () => {
    it('fetches all classes for a school', async () => {
      const mockClasses = [{ id: '1', name: 'Class A' }];
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockClasses });

      const result = await classesService.getAll('school-id');

      expect(apiClient.get).toHaveBeenCalledWith('/schools/school-id/classes');
      expect(result).toEqual(mockClasses);
    });
  });

  describe('create', () => {
    it('creates a class with correct payload', async () => {
      // ...
    });
  });
});
```

### 2. Priority order (same as hooks)

1. `memberships.ts`
2. `classes.ts`
3. `rooms.ts`
4. `teachers.ts`
5. `subjects.ts`
6. `lessons.ts`
7. `time-slots.ts`
8. `terms.ts`
9. `school-years.ts`

## Notes

- Services are simpler to test than hooks (no React context needed)
- Mock the `apiClient` module
- Test request URL construction and payload formatting

## Related Tasks

- [F-024: Improve API Hooks Coverage](./F-024-improve-api-hooks-coverage.md) - do together for efficiency
