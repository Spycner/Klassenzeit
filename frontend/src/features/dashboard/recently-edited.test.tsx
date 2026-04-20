import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentlyEdited } from "@/features/dashboard/recently-edited";
import i18n from "@/i18n/init";
import { server } from "../../../tests/msw-handlers";

const BASE = "http://localhost:3000";

type QueryClientOptions = ConstructorParameters<typeof QueryClient>[0];

function renderTile() {
  const opts: QueryClientOptions = {
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  };
  const queryClient = new QueryClient(opts);
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({});
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <RecentlyEdited />,
  });
  const passthrough = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      passthrough("/subjects"),
      passthrough("/rooms"),
      passthrough("/teachers"),
      passthrough("/week-schemes"),
      passthrough("/school-classes"),
      passthrough("/stundentafeln"),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("RecentlyEdited", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    void i18n.changeLanguage("en");
  });

  it("shows the top five entities sorted by updated_at descending, newest first", async () => {
    server.use(
      http.get(`${BASE}/api/subjects`, () =>
        HttpResponse.json([
          {
            id: "s1",
            name: "Mathematik",
            short_name: "MA",
            color: "chart-1",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:59:30Z",
          },
          {
            id: "s2",
            name: "Deutsch",
            short_name: "DE",
            color: "chart-2",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-19T12:00:00Z",
          },
        ]),
      ),
      http.get(`${BASE}/api/rooms`, () =>
        HttpResponse.json([
          {
            id: "r1",
            name: "Raum 101",
            short_name: "101",
            capacity: 30,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T10:00:00Z",
          },
        ]),
      ),
      http.get(`${BASE}/api/teachers`, () =>
        HttpResponse.json([
          {
            id: "t1",
            first_name: "Anna",
            last_name: "Schmidt",
            short_code: "SCH",
            max_hours_per_week: 25,
            is_active: true,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:30:00Z",
          },
        ]),
      ),
      http.get(`${BASE}/api/week-schemes`, () =>
        HttpResponse.json([
          {
            id: "w1",
            name: "Standardwoche",
            description: null,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-18T12:00:00Z",
          },
        ]),
      ),
      http.get(`${BASE}/api/classes`, () =>
        HttpResponse.json([
          {
            id: "c1",
            name: "1a",
            grade_level: 1,
            stundentafel_id: "x",
            week_scheme_id: "w1",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-10T12:00:00Z",
          },
        ]),
      ),
      http.get(`${BASE}/api/stundentafeln`, () =>
        HttpResponse.json([
          {
            id: "st1",
            name: "Grundschule Klasse 1",
            grade_level: 1,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:00:00Z",
          },
        ]),
      ),
    );

    renderTile();

    const heading = await screen.findByRole("heading", { level: 2, name: /recently edited/i });
    const card = heading.parentElement as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByText(/just now/i)).toBeVisible();
    });

    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveTextContent(/mathematik/i);
    expect(links[1]).toHaveTextContent(/anna schmidt/i);
    expect(links[2]).toHaveTextContent(/grundschule klasse 1/i);
    expect(links[3]).toHaveTextContent(/raum 101/i);
    expect(links[4]).toHaveTextContent(/deutsch/i);
    expect(within(card).queryByText(/\b1a\b/)).toBeNull();
    expect(links[0]).toHaveAttribute("href", "/subjects");
    expect(links[1]).toHaveAttribute("href", "/teachers");
    expect(links[2]).toHaveAttribute("href", "/stundentafeln");
    expect(links[3]).toHaveAttribute("href", "/rooms");
    expect(links[4]).toHaveAttribute("href", "/subjects");
  });

  it("shows the empty state when every list is empty", async () => {
    server.use(
      http.get(`${BASE}/api/subjects`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/rooms`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/teachers`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/week-schemes`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/classes`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/stundentafeln`, () => HttpResponse.json([])),
    );

    renderTile();

    const empty = await screen.findByText(/edit an entity to see it here/i);
    expect(empty).toBeVisible();
    const heading = screen.getByRole("heading", { level: 2, name: /recently edited/i });
    const card = heading.parentElement as HTMLElement;
    expect(within(card).queryByRole("link")).toBeNull();
  });
});
