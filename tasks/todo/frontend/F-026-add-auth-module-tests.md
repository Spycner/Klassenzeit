# F-026: Add Auth Module Tests

## Priority: MEDIUM

## Description

The auth module has only 15% test coverage. `AuthProvider` and `ProtectedRoute` are critical security components that need thorough testing.

## Acceptance Criteria

- [ ] Add tests for `AuthProvider`
- [ ] Add tests for `ProtectedRoute`
- [ ] Test authentication flow
- [ ] Test token refresh handling
- [ ] Achieve 80%+ coverage on auth module

## Current Coverage

| Component | Coverage | Status |
|-----------|----------|--------|
| AuthProvider.tsx | Low | Needs tests |
| ProtectedRoute.tsx | Low | Needs tests |
| AuthContext.tsx | Low | Needs tests |

## Tasks

### 1. Test AuthProvider
**File:** Create `frontend/src/auth/AuthProvider.test.tsx`

Test scenarios:
- Provides authentication context to children
- Handles Keycloak initialization
- Updates auth state on login
- Updates auth state on logout
- Handles token refresh
- Exposes user information correctly

### 2. Test ProtectedRoute
**File:** Create `frontend/src/auth/ProtectedRoute.test.tsx`

Test scenarios:
- Renders children when authenticated
- Redirects to login when not authenticated
- Shows loading state during auth check
- Handles role-based access (if applicable)

### 3. Test AuthContext
**File:** Create `frontend/src/auth/AuthContext.test.tsx`

Test scenarios:
- Provides default values
- useAuth hook returns context values
- Context updates propagate correctly

## Implementation Notes

```typescript
// Example test structure
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './AuthContext';

// Mock Keycloak
vi.mock('keycloak-js', () => ({
  default: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(true),
    authenticated: true,
    token: 'mock-token',
    // ...
  })),
}));

describe('AuthProvider', () => {
  it('provides authentication state to children', async () => {
    const TestComponent = () => {
      const { isAuthenticated } = useAuth();
      return <div>{isAuthenticated ? 'Logged in' : 'Logged out'}</div>;
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Logged in')).toBeInTheDocument();
    });
  });
});
```

## Notes

- Keycloak must be mocked for unit tests
- Consider integration tests with test Keycloak instance for E2E

## Related Tasks

- [F-024: Improve API Hooks Coverage](./F-024-improve-api-hooks-coverage.md) - independent work
