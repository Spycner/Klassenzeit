/**
 * API Client - Base HTTP client for communicating with the Klassenzeit backend
 *
 * Features:
 * - Automatic retry with exponential backoff for network/server errors
 * - Request timeout support
 * - Typed error classes for different error scenarios
 */

import i18n from "@/i18n";

import { ApiClientError } from "./base-error";
import {
  ClientError,
  isRetryableError,
  NetworkError,
  parseRetryAfter,
  RateLimitError,
  RedirectError,
  ServerError,
} from "./errors";

// Token getter for auth header injection
let getAccessToken: (() => string | null) | null = null;

/**
 * Set the token getter function (called by AuthProvider).
 * This allows the auth module to provide the current access token
 * without creating a circular dependency.
 */
export function setTokenGetter(getter: () => string | null): void {
  getAccessToken = getter;
}

// Re-export for backwards compatibility
export { ApiClientError, type ApiError } from "./base-error";

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
};

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30000;

/** Maximum number of retry attempts */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds */
const BASE_DELAY_MS = 1000;

/**
 * Global flag to disable retries (useful for tests).
 * Can be set via window.__DISABLE_API_RETRIES__ = true
 */
function areRetriesDisabled(): boolean {
  if (
    typeof window !== "undefined" &&
    (window as { __DISABLE_API_RETRIES__?: boolean }).__DISABLE_API_RETRIES__
  ) {
    return true;
  }
  return false;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts (default: 3 for GET, 1 for mutations) */
  retries?: number;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s
  return BASE_DELAY_MS * 2 ** attempt;
}

/**
 * Create appropriate error type based on response status
 */
function createErrorFromResponse(
  message: string,
  status: number,
  details: unknown,
  retryAfterMs: number | null,
): ApiClientError | RateLimitError {
  if (status === 429) {
    return new RateLimitError(message, retryAfterMs, details);
  }
  if (status >= 500) {
    return new ServerError(message, status, details);
  }
  if (status >= 400) {
    return new ClientError(message, status, details);
  }
  return new ApiClientError(message, status, details);
}

async function handleResponse<T>(response: Response): Promise<T> {
  // Handle 301 redirect (slug has changed)
  if (response.status === 301) {
    let newSlug = response.headers.get("X-Redirect-Slug");
    let redirectUrl = response.headers.get("Location") || "";

    // Also try to get from JSON body
    try {
      const body = await response.json();
      newSlug = newSlug || body.newSlug;
      redirectUrl = redirectUrl || body.redirectUrl;
    } catch {
      // Body is not JSON, use headers
    }

    if (newSlug) {
      throw new RedirectError(newSlug, redirectUrl);
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let details: unknown;

    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error || errorMessage;
      details = errorBody;
    } catch {
      // Response body is not JSON, use default message
    }

    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    throw createErrorFromResponse(
      errorMessage,
      response.status,
      details,
      retryAfterMs,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Execute fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  config: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...config,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError(`Request timed out after ${timeoutMs}ms`, {
        isTimeout: true,
      });
    }
    // Network error (connection refused, DNS failure, etc.)
    throw new NetworkError(
      error instanceof Error ? error.message : "Network request failed",
      { cause: error instanceof Error ? error : undefined },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    headers,
    timeout = DEFAULT_TIMEOUT_MS,
    retries,
    ...restOptions
  } = options;

  // Determine retry count based on method (GET can retry more)
  const method = (restOptions.method || "GET").toUpperCase();
  const defaultRetries = method === "GET" ? MAX_RETRIES : 1;
  const maxRetries = areRetriesDisabled() ? 0 : (retries ?? defaultRetries);

  // Build headers with optional auth token
  const token = getAccessToken?.();
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": i18n.language,
  };

  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...restOptions,
    headers: {
      ...baseHeaders,
      ...headers,
    },
    // Don't follow redirects automatically so we can handle 301 for slug changes
    redirect: "manual",
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const url = `${getBaseUrl()}${endpoint}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, config, timeout);
      return await handleResponse<T>(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Only retry on retryable errors
      if (!isRetryableError(error)) {
        break;
      }

      // Calculate delay - use Retry-After for rate limits, otherwise exponential backoff
      let delayMs: number;
      if (error instanceof RateLimitError && error.retryAfterMs) {
        delayMs = error.retryAfterMs;
      } else {
        delayMs = getBackoffDelay(attempt);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * API Client with HTTP methods
 */
export const apiClient = {
  get<T>(endpoint: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return request<T>(endpoint, { ...options, method: "GET" });
  },

  post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: "POST", body });
  },

  put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: "PUT", body });
  },

  delete<T>(
    endpoint: string,
    options?: Omit<RequestOptions, "body">,
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: "DELETE" });
  },

  patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return request<T>(endpoint, { ...options, method: "PATCH", body });
  },
};

export default apiClient;
