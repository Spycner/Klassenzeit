import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";

/**
 * Error thrown when an API call returns a non-2xx response.
 *
 * `data` holds the parsed JSON body (the FastAPI error shape: `{ detail: ... }`
 * for simple errors, or `{ detail: [{ loc, msg, type }, ...] }` for 422 validation
 * responses). Callers that need to route field-level messages (e.g. RHF `setError`)
 * should inspect `data.detail`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (response.ok) {
      return response;
    }
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = await response.clone().text();
    }
    throw new ApiError(response.status, body);
  },
};

export const client = createClient<paths>({
  baseUrl: "/",
  credentials: "include",
});
client.use(throwOnError);
