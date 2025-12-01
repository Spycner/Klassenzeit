/**
 * Base API Error Class
 *
 * This is in a separate file to avoid circular dependencies between
 * client.ts and errors.ts.
 */

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}
