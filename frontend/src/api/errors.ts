/**
 * Typed Error Classes for API Error Handling
 *
 * Provides specialized error classes for different error scenarios:
 * - NetworkError: Connection failures, timeouts
 * - ServerError: 5xx responses
 * - ClientError: 4xx responses (validation, not found, unauthorized)
 * - RateLimitError: 429 responses with retry-after support
 */

import { ApiClientError } from "./base-error";

/**
 * Network error - connection failures, timeouts, DNS errors
 */
export class NetworkError extends Error {
  readonly isTimeout: boolean;
  readonly originalError?: Error;

  constructor(
    message: string,
    options?: { isTimeout?: boolean; cause?: Error },
  ) {
    super(message);
    this.name = "NetworkError";
    this.isTimeout = options?.isTimeout ?? false;
    this.originalError = options?.cause;
  }
}

/**
 * Server error - 5xx responses
 */
export class ServerError extends ApiClientError {
  constructor(message: string, status: number, details?: unknown) {
    super(message, status, details);
    this.name = "ServerError";
  }
}

/**
 * Client error - 4xx responses (except 429)
 */
export class ClientError extends ApiClientError {
  readonly isValidationError: boolean;
  readonly isNotFound: boolean;
  readonly isUnauthorized: boolean;
  readonly isForbidden: boolean;

  constructor(message: string, status: number, details?: unknown) {
    super(message, status, details);
    this.name = "ClientError";
    this.isValidationError = status === 400 || status === 422;
    this.isNotFound = status === 404;
    this.isUnauthorized = status === 401;
    this.isForbidden = status === 403;
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 */
export class RateLimitError extends ApiClientError {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null, details?: unknown) {
    super(message, 429, details);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ServerError) {
    return true;
  }
  if (error instanceof RateLimitError) {
    return true;
  }
  // Generic ApiClientError with 5xx status
  if (error instanceof ApiClientError && error.status >= 500) {
    return true;
  }
  return false;
}

/**
 * Parse Retry-After header value to milliseconds
 */
export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  // Try parsing as seconds (numeric value)
  const seconds = Number.parseInt(headerValue, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}
