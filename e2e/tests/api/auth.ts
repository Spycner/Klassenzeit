/**
 * Authentication helper for E2E API tests.
 *
 * Uses Keycloak's Resource Owner Password Credentials (Direct Access Grants)
 * to obtain access tokens for API testing.
 *
 * Supports worker-specific test users to avoid Keycloak brute force protection
 * being triggered during parallel test execution.
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Cache token to avoid repeated auth requests (per-worker due to process isolation)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8180";
const KEYCLOAK_REALM = "klassenzeit";
const KEYCLOAK_CLIENT_ID = "klassenzeit-e2e-api";
const TEST_PASSWORD = "e2e-test-password";

// Pool of test users for parallel execution (one per worker)
const TEST_USERS = [
  "e2e-test-1@klassenzeit.com",
  "e2e-test-2@klassenzeit.com",
  "e2e-test-3@klassenzeit.com",
  "e2e-test-4@klassenzeit.com",
  "e2e-test-5@klassenzeit.com",
  "e2e-test-6@klassenzeit.com",
];

// Current worker index (set by fixture)
let currentWorkerIndex = 0;

/**
 * Set the worker index for selecting the test user.
 * Should be called from the test fixture with test.info().parallelIndex.
 */
export function setWorkerIndex(index: number): void {
  currentWorkerIndex = index;
}

/**
 * Get the test user email for the current worker.
 */
function getTestUser(): string {
  return TEST_USERS[currentWorkerIndex % TEST_USERS.length];
}

/**
 * Get an access token for API testing.
 * Uses cached token if still valid (with 30s buffer).
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 30s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 30000) {
    return cachedToken;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: KEYCLOAK_CLIENT_ID,
      username: getTestUser(),
      password: TEST_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get access token: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  const data: TokenResponse = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

/**
 * Get authorization headers for API requests.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Clear the cached token (useful for testing auth failures).
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
  cachedUserId = null;
}

// Cache current user ID
let cachedUserId: string | null = null;

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080/api";

/**
 * Get the current user's ID.
 * Uses cached ID if available.
 */
export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) {
    return cachedUserId;
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/users/me`, { headers });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get current user: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  const user = await response.json();
  cachedUserId = user.id;
  return cachedUserId;
}
