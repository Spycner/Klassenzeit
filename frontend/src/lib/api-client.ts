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

/**
 * Base URL for API calls.
 *
 * In the browser (dev + prod) we resolve against `window.location.origin` so
 * Vite's proxy and same-origin cookies work. In non-browser contexts (SSR,
 * jsdom tests without a set URL), we fall back to a deterministic placeholder
 * that MSW handlers can match.
 */
const baseUrl =
  typeof window !== "undefined" && window.location
    ? `${window.location.origin}/`
    : "http://localhost/";

export const client = createClient<paths>({
  baseUrl,
  credentials: "include",
  // Resolve `globalThis.fetch` at call time. Without this, openapi-fetch
  // captures the fetch reference at createClient() time, which breaks MSW
  // interception in tests (MSW patches globalThis.fetch later, inside `beforeAll`).
  fetch: (request: Request, init?: RequestInit) => globalThis.fetch(request, init),
});
client.use(throwOnError);
