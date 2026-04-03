# Frontend Auth Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Next.js frontend to Keycloak for login/logout, expose auth state via React context, forward JWTs to the backend, and prove it works with a dashboard page.

**Architecture:** Client-side auth using `keycloak-js` adapter wrapped in a React context provider. A `useAuth` hook exposes user info/token. An `apiClient` fetch wrapper attaches Bearer tokens and school context headers. A minimal dashboard page proves the full round-trip.

**Tech Stack:** Next.js 16 (App Router), React 19, keycloak-js, Vitest + React Testing Library, TypeScript strict mode, Biome linting, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-04-03-frontend-auth-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/keycloak.ts` | Keycloak instance factory + config |
| `frontend/src/providers/keycloak-provider.tsx` | React context provider — init, token refresh, auth state |
| `frontend/src/hooks/use-auth.ts` | Convenience hook wrapping auth context |
| `frontend/src/lib/api-client.ts` | Fetch wrapper with auto Bearer token + X-School-Id |
| `frontend/src/app/layout.tsx` | Modified — wrap children with KeycloakProvider |
| `frontend/src/app/page.tsx` | Modified — redirect to /dashboard |
| `frontend/src/app/dashboard/page.tsx` | Authenticated dashboard — calls /api/auth/me |
| `frontend/src/__tests__/use-auth.test.ts` | Unit tests for useAuth hook |
| `frontend/src/__tests__/api-client.test.ts` | Unit tests for apiClient |
| `frontend/vitest.config.mts` | Vitest configuration |
| `frontend/src/test-utils.tsx` | Test helpers (renderWithProviders, mock auth context) |

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install keycloak-js**

```bash
cd frontend && bun add keycloak-js
```

- [ ] **Step 2: Install test dependencies**

```bash
cd frontend && bun add -d vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Create vitest config**

Create `frontend/vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 4: Add test script to package.json**

Add to `scripts` in `frontend/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify vitest runs**

```bash
cd frontend && bun run test
```

Expected: 0 tests found, exits cleanly.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/bun.lock frontend/vitest.config.mts
git commit -m "Add keycloak-js, vitest, and testing-library to frontend"
```

---

### Task 2: Keycloak instance factory + auth types

**Files:**
- Create: `frontend/src/lib/keycloak.ts`

- [ ] **Step 1: Create Keycloak instance factory and types**

Create `frontend/src/lib/keycloak.ts`:

```ts
import Keycloak from "keycloak-js";

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: string;
  schoolId: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
}

export function createKeycloak(): Keycloak {
  return new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "klassenzeit",
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "klassenzeit-dev",
  });
}

export function parseAuthUser(keycloak: Keycloak): AuthUser | null {
  const parsed = keycloak.tokenParsed;
  if (!parsed) return null;

  const realmRoles: string[] =
    parsed.realm_access?.roles ?? [];
  const role =
    realmRoles.find((r) => ["admin", "teacher", "viewer"].includes(r)) ??
    "viewer";

  return {
    sub: parsed.sub ?? "",
    email: parsed.email ?? "",
    name: parsed.preferred_username ?? parsed.email ?? "",
    role,
    schoolId: parsed.school_id ?? "",
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd frontend && bun run typecheck
```

Expected: exits cleanly (keycloak-js provides its own types).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/keycloak.ts
git commit -m "Add Keycloak instance factory and auth types"
```

---

### Task 3: KeycloakProvider

**Files:**
- Create: `frontend/src/providers/keycloak-provider.tsx`

- [ ] **Step 1: Create the KeycloakProvider**

Create `frontend/src/providers/keycloak-provider.tsx`:

```tsx
"use client";

import {
  type AuthContextValue,
  type AuthUser,
  createKeycloak,
  parseAuthUser,
} from "@/lib/keycloak";
import type Keycloak from "keycloak-js";
import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthenticated: false,
  logout: () => {},
});

type InitState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  const keycloakRef = useRef<Keycloak | null>(null);
  const didInit = useRef(false);
  const [initState, setInitState] = useState<InitState>({ status: "loading" });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const updateAuthState = useCallback((kc: Keycloak) => {
    setToken(kc.token ?? null);
    setUser(parseAuthUser(kc));
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const kc = createKeycloak();
    keycloakRef.current = kc;

    kc.onTokenExpired = () => {
      kc.updateToken(30).catch(() => {
        kc.login();
      });
    };

    kc.onAuthRefreshSuccess = () => {
      updateAuthState(kc);
    };

    kc.init({ onLoad: "login-required", pkceMethod: "S256" })
      .then((authenticated) => {
        if (authenticated) {
          updateAuthState(kc);
          setInitState({ status: "ready" });
        } else {
          kc.login();
        }
      })
      .catch((err) => {
        setInitState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to connect to authentication service",
        });
      });
  }, [updateAuthState]);

  const logout = useCallback(() => {
    keycloakRef.current?.logout({ redirectUri: window.location.origin });
  }, []);

  if (initState.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Loading...</p>
      </div>
    );
  }

  if (initState.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-600">Authentication Error</p>
          <p className="mt-2 text-sm text-gray-500">{initState.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext value={{ user, token, isAuthenticated: true, logout }}>
      {children}
    </AuthContext>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd frontend && bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/providers/keycloak-provider.tsx
git commit -m "Add KeycloakProvider with token refresh and error handling"
```

---

### Task 4: useAuth hook with tests

**Files:**
- Create: `frontend/src/hooks/use-auth.ts`
- Create: `frontend/src/__tests__/use-auth.test.tsx`
- Create: `frontend/src/test-utils.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/test-utils.tsx`:

```tsx
import { AuthContext } from "@/providers/keycloak-provider";
import type { AuthContextValue, AuthUser } from "@/lib/keycloak";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

const defaultUser: AuthUser = {
  sub: "test-sub-id",
  email: "admin@test.com",
  name: "admin",
  role: "admin",
  schoolId: "00000000-0000-0000-0000-000000000001",
};

export function createMockAuthContext(
  overrides?: Partial<AuthContextValue>,
): AuthContextValue {
  return {
    user: defaultUser,
    token: "mock-jwt-token",
    isAuthenticated: true,
    logout: () => {},
    ...overrides,
  };
}

export function AuthTestWrapper({
  children,
  authContext,
}: {
  children: ReactNode;
  authContext?: Partial<AuthContextValue>;
}) {
  const value = createMockAuthContext(authContext);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function renderWithAuth(
  ui: ReactElement,
  authContext?: Partial<AuthContextValue>,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <AuthTestWrapper authContext={authContext}>{children}</AuthTestWrapper>
    ),
    ...options,
  });
}
```

Create `frontend/src/__tests__/use-auth.test.tsx`:

```tsx
import { useAuth } from "@/hooks/use-auth";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthTestWrapper, createMockAuthContext } from "@/test-utils";

describe("useAuth", () => {
  it("returns auth context when inside provider", () => {
    const mockContext = createMockAuthContext();
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthTestWrapper>{children}</AuthTestWrapper>
      ),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("admin@test.com");
    expect(result.current.user?.role).toBe("admin");
    expect(result.current.token).toBe("mock-jwt-token");
  });

  it("returns unauthenticated state when no provider wraps it", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && bun run test
```

Expected: FAIL — `useAuth` does not exist.

- [ ] **Step 3: Write the hook implementation**

Create `frontend/src/hooks/use-auth.ts`:

```ts
import { use } from "react";
import { AuthContext } from "@/providers/keycloak-provider";
import type { AuthContextValue } from "@/lib/keycloak";

export function useAuth(): AuthContextValue {
  return use(AuthContext);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run test
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/use-auth.ts frontend/src/__tests__/use-auth.test.tsx frontend/src/test-utils.tsx
git commit -m "Add useAuth hook with tests"
```

---

### Task 5: apiClient with tests

**Files:**
- Create: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/__tests__/api-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/api-client.test.ts`:

```ts
import { createApiClient } from "@/lib/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches Authorization header with Bearer token", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => null,
    );

    await client.get("/api/auth/me");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt-token",
        }),
      }),
    );
  });

  it("attaches X-School-Id header when schoolId is provided", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => "school-123",
    );

    await client.get("/api/auth/school");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/school",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-School-Id": "school-123",
        }),
      }),
    );
  });

  it("does not attach X-School-Id header when schoolId is null", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => null,
    );

    await client.get("/api/auth/me");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-School-Id"]).toBeUndefined();
  });

  it("sends JSON body on POST", async () => {
    const client = createApiClient(
      () => "token",
      () => null,
    );

    await client.post("/api/data", { name: "test" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const client = createApiClient(
      () => "token",
      () => null,
    );

    await expect(client.get("/api/auth/me")).rejects.toThrow("401");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && bun run test
```

Expected: FAIL — `createApiClient` does not exist.

- [ ] **Step 3: Write the apiClient implementation**

Create `frontend/src/lib/api-client.ts`:

```ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export function createApiClient(
  getToken: () => string | null,
  getSchoolId: () => string | null,
): ApiClient {
  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) ?? {}),
    };

    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const schoolId = getSchoolId();
    if (schoolId) {
      headers["X-School-Id"] = schoolId;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    get<T>(path: string): Promise<T> {
      return request(path, { method: "GET" });
    },
    post<T>(path: string, body?: unknown): Promise<T> {
      return request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    put<T>(path: string, body?: unknown): Promise<T> {
      return request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    delete<T>(path: string): Promise<T> {
      return request(path, { method: "DELETE" });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run test
```

Expected: all 5 apiClient tests + 2 useAuth tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/__tests__/api-client.test.ts
git commit -m "Add apiClient with Bearer token and school context headers"
```

---

### Task 6: Wire up layout and pages

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Update layout.tsx to wrap with KeycloakProvider**

Replace `frontend/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { KeycloakProvider } from "@/providers/keycloak-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klassenzeit",
  description: "Klassenzeit - Stundenplanverwaltung",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <KeycloakProvider>{children}</KeycloakProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Update page.tsx to redirect to dashboard**

Replace `frontend/src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Create dashboard page**

Create `frontend/src/app/dashboard/page.tsx`:

```tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { createApiClient } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

interface MeResponse {
  id: number;
  email: string;
  display_name: string;
  keycloak_id: string;
}

export default function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [backendUser, setBackendUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    if (!token) return;

    const client = createApiClient(
      () => token,
      () => user?.schoolId ?? null,
    );

    try {
      const data = await client.get<MeResponse>("/api/auth/me");
      setBackendUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch user info");
    }
  }, [token, user?.schoolId]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          type="button"
          onClick={logout}
          className="rounded bg-gray-200 px-3 py-1.5 text-sm hover:bg-gray-300"
        >
          Logout
        </button>
      </div>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Token Claims</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Email:</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Name:</dt>
            <dd>{user?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Role:</dt>
            <dd>{user?.role}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">School ID:</dt>
            <dd className="font-mono text-xs">{user?.schoolId}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Backend Response</h2>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {backendUser && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">DB ID:</dt>
              <dd>{backendUser.id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Email:</dt>
              <dd>{backendUser.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Display Name:</dt>
              <dd>{backendUser.display_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Keycloak ID:</dt>
              <dd className="font-mono text-xs">{backendUser.keycloak_id}</dd>
            </div>
          </dl>
        )}
        {!backendUser && !error && (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Create .env.local for local dev**

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=klassenzeit
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=klassenzeit-dev
```

- [ ] **Step 5: Verify typecheck and lint pass**

```bash
cd frontend && bun run typecheck && bun run check
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/page.tsx frontend/src/app/dashboard/page.tsx frontend/.env.local
git commit -m "Wire up KeycloakProvider, dashboard page, and home redirect"
```

---

### Task 7: Run all checks and verify

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd frontend && bun run test
```

Expected: all 7 tests pass.

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: exits cleanly.

- [ ] **Step 3: Run linter**

```bash
cd frontend && bun run check
```

Expected: exits cleanly.

- [ ] **Step 4: Verify build succeeds**

```bash
cd frontend && bun run build
```

Expected: build completes (keycloak-js is client-side only, so SSR build should work since KeycloakProvider is a client component).

- [ ] **Step 5: Update next-steps.md**

Move Step 4 to Done section in `docs/superpowers/next-steps.md`:

```markdown
### Step 4: Frontend Auth Integration ✓
Connect Next.js to Keycloak for login/logout and token forwarding.
- Spec: `specs/2026-04-03-frontend-auth-design.md`
- Plan: `plans/2026-04-03-frontend-auth.md`
```

Unblock Step 5 by moving it from Blocked to Ready.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/next-steps.md
git commit -m "Mark Step 4 (Frontend Auth) complete, unblock Step 5"
```
