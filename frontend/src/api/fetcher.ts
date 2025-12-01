/**
 * Custom fetcher for Orval-generated API clients
 */

import { ApiClientError } from "./client";

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
};

export interface FetcherOptions<TBody = unknown> {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  params?: Record<string, string>;
  data?: TBody;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export async function customFetch<TData, TBody = unknown>({
  url,
  method,
  params,
  data,
  headers,
  signal,
}: FetcherOptions<TBody>): Promise<TData> {
  const baseUrl = getBaseUrl();

  // Build URL with query params
  const fullUrl = new URL(url, baseUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        fullUrl.searchParams.append(key, value);
      }
    });
  }

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    signal,
  };

  if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(fullUrl.toString(), config);

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let details: unknown;

    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error || errorMessage;
      details = errorBody;
    } catch {
      // Response body is not JSON
    }

    throw new ApiClientError(errorMessage, response.status, details);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as TData;
  }

  return response.json();
}

export default customFetch;
