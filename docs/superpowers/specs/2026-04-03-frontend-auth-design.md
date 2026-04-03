# Frontend Auth Integration — Design Spec

**Status:** approved
**Date:** 2026-04-03
**Depends on:** Step 3 (Auth Middleware)

## Goal

Connect the Next.js frontend to Keycloak for login/logout, expose auth state to components, and forward JWTs to the backend on API calls. Prove the full round-trip with a minimal dashboard page.

## Decisions

- **Client-side only auth** — no server-side sessions or BFF pattern. Token lives in the browser. Simpler for early-stage; can layer in SSR auth later if needed.
- **`keycloak-js` adapter** — Keycloak's official JS library. Handles PKCE, token refresh, and login/logout natively. Chosen over `next-auth` (overkill for client-side auth) and `oidc-client-ts` (more boilerplate for no benefit).

## Architecture

```
App (layout.tsx)
  └── KeycloakProvider (initializes keycloak-js, manages tokens)
        └── App content
              ├── Protected routes (redirect to Keycloak login if unauthenticated)
              └── Components use useAuth() hook for user info & token
```

All API calls go through `apiClient`, which attaches the Bearer token and `X-School-Id` header automatically.

## Components

### 1. KeycloakProvider (`src/providers/keycloak-provider.tsx`)

Client component wrapping the app. Responsibilities:

- Initialize `keycloak-js` with `login-required` init option (redirects to Keycloak if not authenticated)
- Store Keycloak instance in a ref, expose auth state via React context
- Set up automatic token refresh via `onTokenExpired` → `keycloak.updateToken(30)`
- Show a loading state during initialization
- If init fails (Keycloak unreachable), show an error message with a retry option

Context value shape:

```ts
interface AuthContext {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
  keycloak: Keycloak | null;
}
```

### 2. useAuth hook (`src/hooks/use-auth.ts`)

Thin wrapper around the auth context. Returns the `AuthContext` value. Throws if used outside `KeycloakProvider`.

`AuthUser` type (parsed from Keycloak token claims):

```ts
interface AuthUser {
  sub: string;         // Keycloak user ID
  email: string;
  name: string;        // preferred_username or email fallback
  role: string;        // realm role (admin | teacher | viewer)
  schoolId: string;    // from school_id claim
}
```

### 3. apiClient (`src/lib/api-client.ts`)

Fetch wrapper for backend API calls:

- Prepends `NEXT_PUBLIC_API_URL` to relative paths
- Attaches `Authorization: Bearer <token>` header
- Attaches `X-School-Id` header from the user's school context
- Returns typed JSON responses
- On 401: the caller handles re-auth (KeycloakProvider's token refresh covers most cases)

```ts
function createApiClient(getToken: () => string | null, getSchoolId: () => string | null) {
  return {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    put<T>(path: string, body: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
  };
}
```

### 4. Dashboard page (`src/app/dashboard/page.tsx`)

Minimal authenticated page that proves the full round-trip:

- Calls `GET /api/auth/me` via `apiClient`
- Displays: user email, name, role
- Shows school context from the token
- Includes a logout button

### 5. Home page update (`src/app/page.tsx`)

- If authenticated: redirect to `/dashboard`
- If not authenticated: KeycloakProvider's `login-required` handles redirect to Keycloak

In practice, with `login-required`, every page requires authentication — the home page simply redirects to dashboard.

## Data Flow

1. User visits any page
2. `KeycloakProvider` initializes `keycloak-js` with `login-required`
3. If no valid session: browser redirects to Keycloak login page
4. User logs in (Keycloak handles PKCE flow)
5. Keycloak redirects back with auth code
6. `keycloak-js` exchanges code for access + refresh tokens
7. `KeycloakProvider` parses token claims, populates `AuthContext`
8. Dashboard renders, calls `/api/auth/me` with Bearer token
9. Backend validates JWT (RS256 via JWKS), returns user info
10. Dashboard displays user info — round-trip complete

## Token Lifecycle

- **Access token lifetime:** 5 minutes (configured in Keycloak realm)
- **Refresh:** `keycloak-js` `onTokenExpired` callback triggers `updateToken(30)` (refresh if expiring within 30s)
- **Refresh failure:** Session expired → redirect to Keycloak login
- **Logout:** `keycloak.logout()` → redirects to Keycloak logout endpoint → redirects back to app

## Environment Variables

Already defined in `.env.dev`, used by the frontend:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=klassenzeit
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=klassenzeit-dev
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Keycloak unreachable during init | Show error message with retry option |
| Token refresh fails | Redirect to Keycloak login |
| API returns 401 | Caller handles; token refresh covers most cases |
| API returns 403 | Display "access denied" — user lacks required role |

## Testing Strategy

- **Unit tests:** `useAuth` hook (mock `keycloak-js`), `apiClient` (mock fetch, verify headers attached)
- **Manual E2E:** Login with seed users (`admin@test.com`, `teacher@test.com`, `viewer@test.com` / `test1234`), verify dashboard shows correct user info and role
- **Automated E2E:** Deferred to Step 5 (when `e2e/` framework is set up)

## New Dependencies

- `keycloak-js` — Keycloak JavaScript adapter

## Files Created/Modified

- `src/providers/keycloak-provider.tsx` — new
- `src/hooks/use-auth.ts` — new
- `src/lib/api-client.ts` — new
- `src/app/dashboard/page.tsx` — new
- `src/app/page.tsx` — modified (redirect to dashboard)
- `src/app/layout.tsx` — modified (wrap with KeycloakProvider)
