# F-026: Add Auth Module Tests

## Priority: MEDIUM

## Description

The auth module has only 15% test coverage. `AuthProvider` and `ProtectedRoute` are critical security components that need thorough testing.

## Acceptance Criteria

- [x] Add tests for `AuthProvider`
- [x] Add tests for `ProtectedRoute`
- [x] Test authentication flow
- [x] Test token refresh handling
- [x] Achieve 80%+ coverage on auth module

## Final Coverage

| Component | Statements | Branch | Functions | Lines |
|-----------|------------|--------|-----------|-------|
| AuthProvider.tsx | 85.71% | 100% | 75% | 83.33% |
| ProtectedRoute.tsx | 100% | 100% | 100% | 100% |
| AuthContext.tsx | 100% | 100% | 100% | 100% |
| CallbackPage.tsx | 100% | 87.5% | 100% | 100% |
| **Auth Module Total** | **95%** | **100%** | **87.5%** | **94.73%** |

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

## Completion Notes

Implemented comprehensive test coverage for the auth module:

### Test Files Created
1. `frontend/src/auth/AuthContext.test.tsx` - 11 tests
2. `frontend/src/auth/ProtectedRoute.test.tsx` - 7 tests
3. `frontend/src/auth/AuthProvider.test.tsx` - 8 tests
4. `frontend/src/pages/CallbackPage.test.tsx` - 10 tests

### Total: 36 new tests added

### Key Testing Approaches
- Used `vi.doMock()` to override the global OIDC mock for different auth states
- Tested loading, authenticated, unauthenticated, and error states
- Verified token getter synchronization with API client
- Tested sessionStorage returnTo URL handling
- Tested navigation redirects after auth callback

### Coverage Achievement
- Auth module: 95% statements, 100% branch coverage (exceeds 80% target)
- The only uncovered code is the `onSigninCallback` in AuthProvider (OIDC callback handler) which would require simulating the real OIDC flow
