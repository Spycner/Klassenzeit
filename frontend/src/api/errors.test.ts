/**
 * Tests for Typed Error Classes
 */

import { describe, expect, it } from "vitest";
import { ApiClientError } from "./client";
import {
  ClientError,
  isRetryableError,
  NetworkError,
  parseRetryAfter,
  RateLimitError,
  RedirectError,
  ServerError,
} from "./errors";

describe("NetworkError", () => {
  it("should create a network error with message", () => {
    const error = new NetworkError("Connection failed");
    expect(error.name).toBe("NetworkError");
    expect(error.message).toBe("Connection failed");
    expect(error.isTimeout).toBe(false);
    expect(error.originalError).toBeUndefined();
  });

  it("should create a timeout error", () => {
    const error = new NetworkError("Request timed out", { isTimeout: true });
    expect(error.isTimeout).toBe(true);
  });

  it("should include original error", () => {
    const cause = new Error("Original error");
    const error = new NetworkError("Connection failed", { cause });
    expect(error.originalError).toBe(cause);
  });
});

describe("ServerError", () => {
  it("should create a server error", () => {
    const error = new ServerError("Internal server error", 500);
    expect(error.name).toBe("ServerError");
    expect(error.message).toBe("Internal server error");
    expect(error.status).toBe(500);
  });

  it("should be an instance of ApiClientError", () => {
    const error = new ServerError("Server error", 503);
    expect(error).toBeInstanceOf(ApiClientError);
  });

  it("should include details", () => {
    const details = { code: "INTERNAL_ERROR" };
    const error = new ServerError("Server error", 500, details);
    expect(error.details).toEqual(details);
  });
});

describe("ClientError", () => {
  it("should create a client error", () => {
    const error = new ClientError("Bad request", 400);
    expect(error.name).toBe("ClientError");
    expect(error.status).toBe(400);
    expect(error.isValidationError).toBe(true);
    expect(error.isNotFound).toBe(false);
  });

  it("should identify 404 as not found", () => {
    const error = new ClientError("Not found", 404);
    expect(error.isNotFound).toBe(true);
    expect(error.isValidationError).toBe(false);
  });

  it("should identify 401 as unauthorized", () => {
    const error = new ClientError("Unauthorized", 401);
    expect(error.isUnauthorized).toBe(true);
  });

  it("should identify 403 as forbidden", () => {
    const error = new ClientError("Forbidden", 403);
    expect(error.isForbidden).toBe(true);
  });

  it("should identify 422 as validation error", () => {
    const error = new ClientError("Unprocessable entity", 422);
    expect(error.isValidationError).toBe(true);
  });
});

describe("RateLimitError", () => {
  it("should create a rate limit error", () => {
    const error = new RateLimitError("Too many requests", 5000);
    expect(error.name).toBe("RateLimitError");
    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(5000);
  });

  it("should handle null retry-after", () => {
    const error = new RateLimitError("Too many requests", null);
    expect(error.retryAfterMs).toBeNull();
  });
});

describe("RedirectError", () => {
  it("should create a redirect error with newSlug and redirectUrl", () => {
    const error = new RedirectError("new-slug", "/api/schools/new-slug");
    expect(error.name).toBe("RedirectError");
    expect(error.newSlug).toBe("new-slug");
    expect(error.redirectUrl).toBe("/api/schools/new-slug");
    expect(error.message).toBe("Resource has moved to: new-slug");
  });

  it("should not be an instance of ApiClientError", () => {
    const error = new RedirectError("new-slug", "/api/schools/new-slug");
    expect(error).not.toBeInstanceOf(ApiClientError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("isRetryableError", () => {
  it("should return true for NetworkError", () => {
    expect(isRetryableError(new NetworkError("Connection failed"))).toBe(true);
  });

  it("should return true for ServerError", () => {
    expect(isRetryableError(new ServerError("Server error", 500))).toBe(true);
  });

  it("should return true for RateLimitError", () => {
    expect(isRetryableError(new RateLimitError("Rate limited", 1000))).toBe(
      true,
    );
  });

  it("should return true for ApiClientError with 5xx status", () => {
    expect(isRetryableError(new ApiClientError("Error", 503))).toBe(true);
  });

  it("should return false for ClientError", () => {
    expect(isRetryableError(new ClientError("Bad request", 400))).toBe(false);
  });

  it("should return false for RedirectError", () => {
    expect(
      isRetryableError(new RedirectError("new-slug", "/api/schools/new-slug")),
    ).toBe(false);
  });

  it("should return false for generic errors", () => {
    expect(isRetryableError(new Error("Generic error"))).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("should return null for null input", () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("should parse numeric seconds", () => {
    expect(parseRetryAfter("60")).toBe(60000);
    expect(parseRetryAfter("1")).toBe(1000);
  });

  it("should handle invalid values", () => {
    expect(parseRetryAfter("invalid")).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
  });
});
