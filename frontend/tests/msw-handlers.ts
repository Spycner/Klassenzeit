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

export const initialRooms = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Raum 101",
    short_name: "101",
    capacity: 30,
    suitability_mode: "general",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const initialTeachers = [
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    first_name: "Anna",
    last_name: "Schmidt",
    short_code: "SCH",
    max_hours_per_week: 25,
    is_active: true,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const initialWeekSchemes = [
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Standardwoche",
    description: "Mo-Fr, 8 Blöcke",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const defaultHandlers = [
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(adminMe)),
  http.post(`${BASE}/auth/login`, async () => HttpResponse.json(null, { status: 204 })),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json(null, { status: 204 })),
  http.get(`${BASE}/subjects`, () => HttpResponse.json(initialSubjects)),
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
  http.get(`${BASE}/rooms`, () => HttpResponse.json(initialRooms)),
  http.post(`${BASE}/rooms`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      short_name: string;
      capacity: number | null;
      suitability_mode: "general" | "specialized";
    };
    return HttpResponse.json(
      {
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        ...body,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
  http.get(`${BASE}/teachers`, () => HttpResponse.json(initialTeachers)),
  http.post(`${BASE}/teachers`, async ({ request }) => {
    const body = (await request.json()) as {
      first_name: string;
      last_name: string;
      short_code: string;
      max_hours_per_week: number;
    };
    return HttpResponse.json(
      {
        id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        ...body,
        is_active: true,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
  http.get(`${BASE}/week-schemes`, () => HttpResponse.json(initialWeekSchemes)),
  http.post(`${BASE}/week-schemes`, async ({ request }) => {
    const body = (await request.json()) as { name: string; description?: string | null };
    return HttpResponse.json(
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        name: body.name,
        description: body.description ?? null,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
];

export const server = setupServer(...defaultHandlers);
