import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

// jsdom's default window.location.origin is http://localhost:3000, which is
// what the api-client resolves its baseUrl against during tests.
const BASE = "http://localhost:3000";

export const adminMe = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.com",
  role: "admin",
  created_at: "2026-04-17T00:00:00Z",
};

export const initialSubjects = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Mathematik",
    short_name: "MA",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const defaultHandlers = [
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(adminMe)),
  http.post(`${BASE}/auth/login`, async () => HttpResponse.json(null, { status: 204 })),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json(null, { status: 204 })),
  http.get(`${BASE}/subjects`, () => {
    console.log("[msw] /subjects hit");
    return HttpResponse.json(initialSubjects);
  }),
  http.post(`${BASE}/subjects`, async ({ request }) => {
    const body = (await request.json()) as { name: string; short_name: string };
    return HttpResponse.json(
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: body.name,
        short_name: body.short_name,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
];

export const server = setupServer(...defaultHandlers);
