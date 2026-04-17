import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Render a component inside a TanStack Router + React Query test harness.
 *
 * Creates a minimal router with the given element mounted at `/`, so tests
 * can exercise components that depend on `useNavigate`, `useSearch`, hooks
 * that rely on `QueryClient`, etc.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRouteWithContext<RouterContext>()({});
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}
