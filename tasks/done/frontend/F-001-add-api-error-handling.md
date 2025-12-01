# F-001: Add Comprehensive Error Handling to API Client

## Description
Implement robust error handling for all API interactions.

## Acceptance Criteria
- [x] Handle network failures with retry logic
- [x] Handle timeout errors with appropriate messaging
- [x] Handle 5xx server errors with user-friendly messages
- [x] Handle rate limiting (429) with backoff
- [x] Create typed error classes for different error scenarios
- [x] Add error boundary components for unhandled errors

## Dependencies
None

## Blocks
- [F-005: Request Rate Limiting](../../todo/frontend/F-005-request-rate-limiting.md)
- [F-008: Optimistic Updates](../../todo/frontend/F-008-optimistic-updates.md)
- [G-006: Network Condition Tests](../../todo/global/G-006-network-condition-tests.md)

## Completion Notes

### Implementation Date
2025-12-01

### What Was Implemented

#### 1. Typed Error Classes (`src/api/errors.ts`)
- `NetworkError` - Connection failures, timeouts (with `isTimeout` flag)
- `ServerError` - 5xx responses
- `ClientError` - 4xx responses (with `isNotFound`, `isUnauthorized`, `isForbidden`, `isValidationError` flags)
- `RateLimitError` - 429 responses with `retryAfterMs` support
- `isRetryableError()` - Type guard for retry logic
- `parseRetryAfter()` - Parse Retry-After header

#### 2. Retry Logic (`src/api/client.ts`)
- Automatic retries with exponential backoff (1s, 2s, 4s base delays)
- GET requests: 3 retries by default
- Mutations: 1 retry by default
- Only retries on retryable errors (network, 5xx, 429)
- Respects `Retry-After` header for rate limiting
- 30 second default timeout with `NetworkError` on timeout
- Configurable via `retries` and `timeout` options per request

#### 3. Error Display Utilities (`src/api/error-handler.ts`)
- `getErrorMessage(error)` - Extract user-friendly message from any error type
- `showErrorToast(error, options?)` - Display error toast via Sonner
- `showSuccessToast(message, options?)` - Display success toast

#### 4. React Query Integration (`src/api/hooks/query-client.ts`)
- Global `MutationCache.onError` shows toast for mutation failures
- Smart retry function only retries on retryable errors
- Query errors logged but not toasted (component handles display)

#### 5. Error Boundary (`src/components/ErrorBoundary.tsx`)
- Catches unhandled React errors
- Shows fallback UI with error details (expandable)
- "Try Again" button to reset and retry
- Supports custom fallback prop

#### 6. App Integration (`src/App.tsx`)
- `<ErrorBoundary>` wrapping the app
- `<Toaster position="top-right" richColors closeButton />` from Sonner

### Files Created
- `src/api/base-error.ts` - Base ApiClientError class
- `src/api/errors.ts` - Typed error classes
- `src/api/error-handler.ts` - Error display utilities
- `src/components/ErrorBoundary.tsx` - Error boundary component
- `src/api/errors.test.ts` - 23 tests
- `src/api/error-handler.test.ts` - 20 tests
- `src/components/ErrorBoundary.test.tsx` - 6 tests

### Files Modified
- `src/api/client.ts` - Retry logic, timeout, typed errors
- `src/api/hooks/query-client.ts` - Global error callbacks
- `src/api/index.ts` - Re-exports
- `src/App.tsx` - Toaster and ErrorBoundary
- `src/test/setup.ts` - Disable retries in tests
- `src/test/mocks/handlers.ts` - Additional error handlers

### Dependencies Added
- `sonner` - Toast notifications

### Testing
- 95 tests passing (49 new tests added)
- API retries disabled in test environment via `window.__DISABLE_API_RETRIES__`

### Usage Examples

```tsx
// Errors are automatically shown as toasts for mutations
const { mutate } = useCreateSchool();
mutate(data); // On error, toast automatically shown

// For queries, check error state in component
const { data, error, isError } = useSchools();
if (isError) {
  return <div>Error: {getErrorMessage(error)}</div>;
}

// Manual error display
import { showErrorToast, showSuccessToast } from "@/api";
try {
  await someOperation();
  showSuccessToast("Operation completed!");
} catch (error) {
  showErrorToast(error);
}

// Type-specific error handling
import { ClientError, ServerError, NetworkError } from "@/api";
if (error instanceof ClientError && error.isNotFound) {
  // Handle 404
}
```
