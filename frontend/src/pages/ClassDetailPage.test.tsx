import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockClassDetail } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { ClassDetailPage } from "./ClassDetailPage";

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
});

// Mock navigation
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

// Mutable params for testing different scenarios
let mockParams: { id?: string } = {};

// Mock toast - use vi.hoisted to avoid hoisting issues
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

const API_BASE = "http://localhost:8080";

describe("ClassDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
  });

  describe("create mode", () => {
    beforeEach(() => {
      mockParams = {}; // No id = create mode
    });

    it("renders form without loading class details", async () => {
      render(<ClassDetailPage />);

      // Should show "Neue Klasse" title
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neue klasse/i }),
        ).toBeInTheDocument();
      });

      // Form should be empty
      expect(screen.getByLabelText(/klassenname/i)).toHaveValue("");
    });

    it("does not render delete button in create mode", async () => {
      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neue klasse/i }),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /löschen/i }),
      ).not.toBeInTheDocument();
    });

    it("creates class and navigates to list on success", async () => {
      const user = userEvent.setup();

      server.use(
        http.post(
          `${API_BASE}/api/schools/:schoolId/classes`,
          async ({ request }) => {
            const body = await request.json();
            return HttpResponse.json(
              {
                ...mockClassDetail,
                ...(body as object),
                id: "new-class-id",
              },
              { status: 201 },
            );
          },
        ),
      );

      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/klassenname/i), "7a");
      await user.type(screen.getByLabelText(/klassenstufe/i), "7");

      await user.click(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/classes");
      });
    });
  });

  describe("edit mode", () => {
    beforeEach(() => {
      mockParams = { id: "class-1" };
    });

    it("loads class from API on mount", async () => {
      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      });
    });

    it("displays form with pre-filled data for existing class", async () => {
      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      });

      expect(screen.getByLabelText(/klassenstufe/i)).toHaveValue(5);
      expect(screen.getByLabelText(/schüleranzahl/i)).toHaveValue(25);
    });

    it("shows delete button for existing class", async () => {
      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      });

      expect(
        screen.getByRole("button", { name: /löschen/i }),
      ).toBeInTheDocument();
    });

    it("handles 404 not found gracefully", async () => {
      mockParams = { id: "non-existent" };

      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes/:id`, () => {
          return HttpResponse.json(
            { message: "Class not found" },
            { status: 404 },
          );
        }),
      );

      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    // Note: Testing form submission for existing class is complex due to React Query cache
    // invalidation timing. The create flow ("creates class and navigates to list on success")
    // validates the core mutation workflow. Update functionality is verified through E2E tests.
  });

  describe("delete functionality", () => {
    beforeEach(() => {
      mockParams = { id: "class-1" };
    });

    it("shows delete confirmation dialog", async () => {
      const user = userEvent.setup();

      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      });

      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/klasse löschen\?/i)).toBeInTheDocument();
      });
    });

    it("deletes class and navigates to list on confirm", async () => {
      const user = userEvent.setup();

      server.use(
        http.delete(`${API_BASE}/api/schools/:schoolId/classes/:id`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<ClassDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      });

      // Open delete dialog
      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/klasse löschen\?/i)).toBeInTheDocument();
      });

      // Find the confirm button in the dialog (there might be two "Löschen" buttons)
      const dialogButtons = screen.getAllByRole("button", { name: /löschen/i });
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/classes");
      });
    });
  });

  describe("loading and error states", () => {
    it("shows loading state while fetching in edit mode", async () => {
      mockParams = { id: "class-1" };

      // Create a delayed handler to ensure we catch the loading state
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes/:id`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json(mockClassDetail);
        }),
      );

      render(<ClassDetailPage />);

      // Should show loading initially - wait briefly to ensure component has rendered
      await waitFor(
        () => {
          expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
        },
        { timeout: 50 },
      );
    });

    // Note: "no school selected" error state testing requires mocking useSchoolContext
    // which is not currently supported by test-utils. This edge case should be tested
    // at the integration level or when test-utils infrastructure is enhanced.
  });
});
