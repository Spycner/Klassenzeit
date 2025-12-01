/**
 * Tests for Error Display Utilities
 */

import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./client";
import {
  getErrorMessage,
  showErrorToast,
  showSuccessToast,
} from "./error-handler";
import {
  ClientError,
  NetworkError,
  RateLimitError,
  ServerError,
} from "./errors";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("getErrorMessage", () => {
  it("should return timeout message for timeout errors", () => {
    const error = new NetworkError("Timeout", { isTimeout: true });
    expect(getErrorMessage(error)).toBe(
      "Request timed out. Please check your connection and try again.",
    );
  });

  it("should return connection message for network errors", () => {
    const error = new NetworkError("Failed to fetch");
    expect(getErrorMessage(error)).toBe(
      "Unable to connect to the server. Please check your internet connection.",
    );
  });

  it("should return rate limit message", () => {
    const error = new RateLimitError("Too many requests", 5000);
    expect(getErrorMessage(error)).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
  });

  it("should include status and message for server errors", () => {
    const error = new ServerError("Database connection failed", 500);
    expect(getErrorMessage(error)).toBe(
      "Server error (500): Database connection failed",
    );
  });

  it("should include status and message for client errors", () => {
    const error = new ClientError("Invalid data", 400);
    expect(getErrorMessage(error)).toBe("Validation error (400): Invalid data");
  });

  it("should show not found message for 404", () => {
    const error = new ClientError("Resource not found", 404);
    expect(getErrorMessage(error)).toBe("Not found (404): Resource not found");
  });

  it("should show unauthorized message for 401", () => {
    const error = new ClientError("Unauthorized", 401);
    expect(getErrorMessage(error)).toBe(
      "You are not authorized. Please log in and try again.",
    );
  });

  it("should show forbidden message for 403", () => {
    const error = new ClientError("Forbidden", 403);
    expect(getErrorMessage(error)).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it("should include status and message for generic ApiClientError", () => {
    const error = new ApiClientError("Something went wrong", 418);
    expect(getErrorMessage(error)).toBe("Error (418): Something went wrong");
  });

  it("should return error message for standard errors", () => {
    const error = new Error("Standard error message");
    expect(getErrorMessage(error)).toBe("Standard error message");
  });

  it("should return fallback for unknown error types", () => {
    expect(getErrorMessage("string error")).toBe(
      "An unexpected error occurred.",
    );
    expect(getErrorMessage(null)).toBe("An unexpected error occurred.");
  });
});

describe("showErrorToast", () => {
  it("should call toast.error with correct parameters", () => {
    const error = new ServerError("Server error", 500);
    showErrorToast(error);

    expect(toast.error).toHaveBeenCalledWith("Server Error", {
      description: "Server error (500): Server error",
      duration: 5000,
    });
  });

  it("should use custom title and description when provided", () => {
    const error = new Error("Some error");
    showErrorToast(error, {
      title: "Custom Title",
      description: "Custom description",
    });

    expect(toast.error).toHaveBeenCalledWith("Custom Title", {
      description: "Custom description",
      duration: 5000,
    });
  });

  it("should use custom duration when provided", () => {
    const error = new Error("Some error");
    showErrorToast(error, { duration: 10000 });

    expect(toast.error).toHaveBeenCalledWith(expect.any(String), {
      description: expect.any(String),
      duration: 10000,
    });
  });

  it("should show Connection Error title for network errors", () => {
    const error = new NetworkError("Failed to fetch");
    showErrorToast(error);

    expect(toast.error).toHaveBeenCalledWith("Connection Error", {
      description: expect.any(String),
      duration: 5000,
    });
  });

  it("should show Request Timeout title for timeout errors", () => {
    const error = new NetworkError("Timeout", { isTimeout: true });
    showErrorToast(error);

    expect(toast.error).toHaveBeenCalledWith("Request Timeout", {
      description: expect.any(String),
      duration: 5000,
    });
  });

  it("should show Rate Limited title for rate limit errors", () => {
    const error = new RateLimitError("Too many requests", 5000);
    showErrorToast(error);

    expect(toast.error).toHaveBeenCalledWith("Rate Limited", {
      description: expect.any(String),
      duration: 5000,
    });
  });
});

describe("showSuccessToast", () => {
  it("should call toast.success with default title", () => {
    showSuccessToast("Operation completed");

    expect(toast.success).toHaveBeenCalledWith("Success", {
      description: "Operation completed",
      duration: 3000,
    });
  });

  it("should use custom title when provided", () => {
    showSuccessToast("Data saved", { title: "Saved" });

    expect(toast.success).toHaveBeenCalledWith("Saved", {
      description: "Data saved",
      duration: 3000,
    });
  });

  it("should use custom duration when provided", () => {
    showSuccessToast("Done", { duration: 1000 });

    expect(toast.success).toHaveBeenCalledWith("Success", {
      description: "Done",
      duration: 1000,
    });
  });
});
