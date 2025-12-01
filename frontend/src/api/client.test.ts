/**
 * Tests for the API Client
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/mocks/server";
import { ApiClientError, apiClient } from "./client";

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

      await expect(apiClient.get("/api/test")).rejects.toThrow(ApiClientError);
      await expect(apiClient.get("/api/test")).rejects.toMatchObject({
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

      await expect(apiClient.get("/api/test")).rejects.toThrow(ApiClientError);
      await expect(apiClient.get("/api/test")).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});
