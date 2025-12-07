# F-025: Improve API Services Test Coverage

## Priority: LOW (Intentionally Skipped)

## Status: SKIPPED (2025-12-07)

## Description

Most API service files have low test coverage (25-42%). These services handle the actual API calls and should be well-tested.

## Decision

**This task was intentionally skipped** during the implementation of F-024 (API Hooks Coverage) because:

1. **Services are thin wrappers** - They simply call the API client with the correct URL and payload
2. **API client has comprehensive tests** - The `client.test.ts` file tests all HTTP operations, error handling, retries, etc.
3. **Hook tests provide indirect coverage** - Via MSW mocking, the hook tests exercise the service functions
4. **Minimal additional value** - Direct service tests would be mostly duplicating the API client tests

## Original Acceptance Criteria (Not Done)

- [ ] Add tests for all service functions
- [ ] Achieve 80%+ coverage on API services
- [ ] Test request formatting
- [ ] Test error handling

## Original Coverage

| Service | Coverage | Status |
|---------|----------|--------|
| classes.ts | 25% | Covered by hook tests |
| lessons.ts | 25% | Covered by hook tests |
| memberships.ts | 25% | Covered by hook tests |
| rooms.ts | 25% | Covered by hook tests |
| school-years.ts | 25% | Covered by hook tests |
| terms.ts | 25% | Covered by hook tests |
| time-slots.ts | 25% | Covered by hook tests |
| teachers.ts | 42% | Covered by hook tests |
| subjects.ts | 63% | Covered by hook tests |
| schools.ts | 100% | Complete |
| solver.ts | 100% | Complete |
| users.ts | 100% | Complete |

## Notes

If direct service tests are ever needed, they would follow this pattern:

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
});
```

## Related Tasks

- [F-024: Improve API Hooks Coverage](../../done/frontend/F-024-improve-api-hooks-coverage.md) - Completed, provides indirect service coverage
