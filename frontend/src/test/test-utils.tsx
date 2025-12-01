/**
 * Test utilities for rendering components with providers
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router";

/**
 * Creates a new QueryClient configured for testing
 * - Disabled retries for faster tests
 * - Disabled gc to prevent memory issues during tests
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  initialEntries?: string[];
}

/**
 * Creates a wrapper component with all necessary providers
 */
export function createWrapper(
  queryClient?: QueryClient,
  initialEntries?: string[],
) {
  const client = queryClient ?? createTestQueryClient();

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries ?? ["/"]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/**
 * Custom render function that wraps components with providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
) {
  const { queryClient, initialEntries, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: createWrapper(queryClient, initialEntries),
    ...renderOptions,
  });
}

// Re-export everything from testing-library
export * from "@testing-library/react";
export { renderWithProviders as render };
