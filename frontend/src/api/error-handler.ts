/**
 * Error Display Utilities
 *
 * Provides functions for extracting user-friendly error messages
 * and displaying error notifications via toast.
 */

import { toast } from "sonner";
import { ApiClientError } from "./client";
import {
  ClientError,
  NetworkError,
  RateLimitError,
  ServerError,
} from "./errors";
import { ValidationError } from "./validation/validate";

/**
 * Extract a user-friendly error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.errors.join(". ");
  }

  if (error instanceof NetworkError) {
    if (error.isTimeout) {
      return "Request timed out. Please check your connection and try again.";
    }
    return "Unable to connect to the server. Please check your internet connection.";
  }

  if (error instanceof RateLimitError) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (error instanceof ServerError) {
    return `Server error (${error.status}): ${error.message}`;
  }

  if (error instanceof ClientError) {
    if (error.isNotFound) {
      return `Not found (${error.status}): ${error.message}`;
    }
    if (error.isUnauthorized) {
      return "You are not authorized. Please log in and try again.";
    }
    if (error.isForbidden) {
      return "You don't have permission to perform this action.";
    }
    if (error.isValidationError) {
      return `Validation error (${error.status}): ${error.message}`;
    }
    return `Error (${error.status}): ${error.message}`;
  }

  if (error instanceof ApiClientError) {
    return `Error (${error.status}): ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

/**
 * Get the error title based on error type
 */
function getErrorTitle(error: unknown): string {
  if (error instanceof ValidationError) {
    return "Validation Error";
  }
  if (error instanceof NetworkError) {
    return error.isTimeout ? "Request Timeout" : "Connection Error";
  }
  if (error instanceof RateLimitError) {
    return "Rate Limited";
  }
  if (error instanceof ServerError) {
    return "Server Error";
  }
  if (error instanceof ClientError) {
    if (error.isNotFound) return "Not Found";
    if (error.isUnauthorized) return "Unauthorized";
    if (error.isForbidden) return "Forbidden";
    if (error.isValidationError) return "Validation Error";
    return "Request Failed";
  }
  return "Error";
}

export interface ShowErrorToastOptions {
  /** Custom title for the toast */
  title?: string;
  /** Custom description/message */
  description?: string;
  /** Duration in milliseconds (default: 5000) */
  duration?: number;
}

/**
 * Display an error toast notification
 */
export function showErrorToast(
  error: unknown,
  options: ShowErrorToastOptions = {},
): void {
  const title = options.title ?? getErrorTitle(error);
  const description = options.description ?? getErrorMessage(error);
  const duration = options.duration ?? 5000;

  toast.error(title, {
    description,
    duration,
  });
}

/**
 * Display a success toast notification
 */
export function showSuccessToast(
  message: string,
  options: { title?: string; duration?: number } = {},
): void {
  const { title = "Success", duration = 3000 } = options;

  toast.success(title, {
    description: message,
    duration,
  });
}
