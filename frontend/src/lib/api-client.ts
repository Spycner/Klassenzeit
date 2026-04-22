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
    super(message ?? formatApiDetail(data) ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface ValidationItem {
  loc: unknown[];
  msg: string;
}

function isValidationItem(value: unknown): value is ValidationItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as { loc?: unknown; msg?: unknown };
  return Array.isArray(item.loc) && typeof item.msg === "string";
}

function formatValidationItem(item: ValidationItem): string {
  const [head, ...rest] = item.loc;
  const parts = head === "body" || head === "query" || head === "path" ? rest : item.loc;
  const field = parts.map(String).join(".");
  return field ? `${field}: ${item.msg}` : item.msg;
}

/**
 * Derives a human-readable string from a FastAPI error body.
 *
 * Handles: plain strings, `{ detail: "..." }`, and `{ detail: [{ loc, msg }, ...] }`
 * (the Pydantic 422 shape). Returns `null` when the shape is unrecognised so
 * callers can fall back to a generic message.
 */
export function formatApiDetail(data: unknown): string | null {
  if (typeof data === "string") return data.length > 0 ? data : null;
  if (typeof data !== "object" || data === null) return null;
  if (!("detail" in data)) return null;
  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const items = detail.filter(isValidationItem).map(formatValidationItem);
    return items.length > 0 ? items.join("; ") : null;
  }
  return null;
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
