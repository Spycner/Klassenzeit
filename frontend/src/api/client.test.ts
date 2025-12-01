/**
 * Tests for the API Client
 */

import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { ApiClientError, apiClient } from "./client";
import { ClientError, RateLimitError, ServerError } from "./errors";

const API_BASE = "http://localhost:8080";

describe("apiClient", () => {
  describe("get", () => {
    it("should fetch data successfully", async () => {
      const mockData = { id: "1", name: "Test" };
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(mockData);
        }),
      );

      const result = await apiClient.get("/api/test");
      expect(result).toEqual(mockData);
    });

    it("should handle 404 errors", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json({ message: "Not found" }, { status: 404 });
        }),
      );

      await expect(apiClient.get("/api/test")).rejects.toThrow(ApiClientError);
      await expect(apiClient.get("/api/test")).rejects.toMatchObject({
        status: 404,
        message: "Not found",
      });
    });

    it("should handle 500 errors", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(
            { message: "Internal server error" },
            { status: 500 },
          );
        }),
      );

      // Disable retries for this test
      await expect(apiClient.get("/api/test", { retries: 0 })).rejects.toThrow(
        ApiClientError,
      );
      await expect(
        apiClient.get("/api/test", { retries: 0 }),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  describe("post", () => {
    it("should post data successfully", async () => {
      const requestData = { name: "New Item" };
      const responseData = { id: "1", name: "New Item" };

      server.use(
        http.post(`${API_BASE}/api/test`, async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(requestData);
          return HttpResponse.json(responseData, { status: 201 });
        }),
      );

      const result = await apiClient.post("/api/test", requestData);
      expect(result).toEqual(responseData);
    });

    it("should handle validation errors", async () => {
      server.use(
        http.post(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(
            { message: "Validation failed", details: { name: "Required" } },
            { status: 400 },
          );
        }),
      );

      await expect(apiClient.post("/api/test", {})).rejects.toThrow(
        ApiClientError,
      );
      await expect(apiClient.post("/api/test", {})).rejects.toMatchObject({
        status: 400,
        message: "Validation failed",
      });
    });
  });

  describe("put", () => {
    it("should update data successfully", async () => {
      const requestData = { name: "Updated Item" };
      const responseData = { id: "1", name: "Updated Item" };

      server.use(
        http.put(`${API_BASE}/api/test/1`, async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(requestData);
          return HttpResponse.json(responseData);
        }),
      );

      const result = await apiClient.put("/api/test/1", requestData);
      expect(result).toEqual(responseData);
    });
  });

  describe("delete", () => {
    it("should delete successfully and return undefined", async () => {
      server.use(
        http.delete(`${API_BASE}/api/test/1`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      const result = await apiClient.delete("/api/test/1");
      expect(result).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should include error details in ApiClientError", async () => {
      const errorDetails = { field: "name", error: "too short" };
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(
            { message: "Bad request", details: errorDetails },
            { status: 400 },
          );
        }),
      );

      try {
        await apiClient.get("/api/test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe("Bad request");
        expect(apiError.details).toEqual({
          message: "Bad request",
          details: errorDetails,
        });
      }
    });

    it("should handle non-JSON error responses", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return new HttpResponse("Server error", { status: 500 });
        }),
      );

      // Disable retries for this test
      await expect(apiClient.get("/api/test", { retries: 0 })).rejects.toThrow(
        ApiClientError,
      );
      await expect(
        apiClient.get("/api/test", { retries: 0 }),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  describe("typed errors", () => {
    it("should throw ServerError for 5xx responses", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        }),
      );

      // Disable retries for this test
      await expect(
        apiClient.get("/api/test", { retries: 0 }),
      ).rejects.toBeInstanceOf(ServerError);
    });

    it("should throw ClientError for 4xx responses", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json({ message: "Bad request" }, { status: 400 });
        }),
      );

      await expect(apiClient.get("/api/test")).rejects.toBeInstanceOf(
        ClientError,
      );
    });

    it("should throw RateLimitError for 429 responses", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json(
            { message: "Too many requests" },
            {
              status: 429,
              headers: { "Retry-After": "60" },
            },
          );
        }),
      );

      try {
        // Disable retries for this test
        await apiClient.get("/api/test", { retries: 0 });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.retryAfterMs).toBe(60000);
      }
    });

    it("should throw ClientError for 404", async () => {
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          return HttpResponse.json({ message: "Not found" }, { status: 404 });
        }),
      );

      try {
        await apiClient.get("/api/test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ClientError);
        const clientError = error as ClientError;
        expect(clientError.isNotFound).toBe(true);
      }
    });
  });

  describe("retry logic", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not retry on client errors (4xx)", async () => {
      let requestCount = 0;
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          requestCount++;
          return HttpResponse.json({ message: "Bad request" }, { status: 400 });
        }),
      );

      await expect(apiClient.get("/api/test")).rejects.toThrow();
      expect(requestCount).toBe(1);
    });

    it("should respect custom retry count", async () => {
      let requestCount = 0;
      server.use(
        http.get(`${API_BASE}/api/test`, () => {
          requestCount++;
          return HttpResponse.json({ message: "Error" }, { status: 500 });
        }),
      );

      const promise = apiClient.get("/api/test", { retries: 0 });

      await expect(promise).rejects.toThrow();
      expect(requestCount).toBe(1);
    });
  });
});
