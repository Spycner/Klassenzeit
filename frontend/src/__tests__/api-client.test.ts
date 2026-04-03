import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";

const mockFetch = vi.fn();

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches Authorization header with Bearer token", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => null,
    );

    await client.get("/api/auth/me");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt-token",
        }),
      }),
    );
  });

  it("attaches X-School-Id header when schoolId is provided", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => "school-123",
    );

    await client.get("/api/auth/school");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/school",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-School-Id": "school-123",
        }),
      }),
    );
  });

  it("does not attach X-School-Id header when schoolId is null", async () => {
    const client = createApiClient(
      () => "my-jwt-token",
      () => null,
    );

    await client.get("/api/auth/me");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-School-Id"]).toBeUndefined();
  });

  it("sends JSON body on POST", async () => {
    const client = createApiClient(
      () => "token",
      () => null,
    );

    await client.post("/api/data", { name: "test" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const client = createApiClient(
      () => "token",
      () => null,
    );

    await expect(client.get("/api/auth/me")).rejects.toThrow("401");
  });
});
