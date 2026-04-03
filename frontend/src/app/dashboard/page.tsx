"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createApiClient } from "@/lib/api-client";

interface MeResponse {
  id: number;
  email: string;
  display_name: string;
  keycloak_id: string;
}

export default function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [backendUser, setBackendUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    if (!token) return;

    const client = createApiClient(
      () => token,
      () => user?.schoolId ?? null,
    );

    try {
      const data = await client.get<MeResponse>("/api/auth/me");
      setBackendUser(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch user info",
      );
    }
  }, [token, user?.schoolId]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          type="button"
          onClick={logout}
          className="rounded bg-gray-200 px-3 py-1.5 text-sm hover:bg-gray-300"
        >
          Logout
        </button>
      </div>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Token Claims</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Email:</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Name:</dt>
            <dd>{user?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Role:</dt>
            <dd>{user?.role}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">School ID:</dt>
            <dd className="font-mono text-xs">{user?.schoolId}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Backend Response</h2>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {backendUser && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">DB ID:</dt>
              <dd>{backendUser.id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Email:</dt>
              <dd>{backendUser.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Display Name:</dt>
              <dd>{backendUser.display_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Keycloak ID:</dt>
              <dd className="font-mono text-xs">{backendUser.keycloak_id}</dd>
            </div>
          </dl>
        )}
        {!backendUser && !error && (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        )}
      </section>
    </main>
  );
}
