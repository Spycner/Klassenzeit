import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockSubjectDetail } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { SubjectDetailPage } from "./SubjectDetailPage";

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

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const API_BASE = "http://localhost:8080";

describe("SubjectDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
  });

  describe("create mode", () => {
    beforeEach(() => {
      mockParams = {}; // No id = create mode
    });

    it("renders form without loading subject details", async () => {
      render(<SubjectDetailPage />);

      // Should show "Neues Fach" title
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neues fach/i }),
        ).toBeInTheDocument();
      });

      // Form should be empty
      expect(screen.getByLabelText(/fachname/i)).toHaveValue("");
      expect(screen.getByLabelText(/kürzel/i)).toHaveValue("");
    });

    it("does not render delete button in create mode", async () => {
      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neues fach/i }),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /löschen/i }),
      ).not.toBeInTheDocument();
    });

    it("creates subject and navigates to list on success", async () => {
      const user = userEvent.setup();

      server.use(
        http.post(
          `${API_BASE}/api/schools/:schoolId/subjects`,
          async ({ request }) => {
            const body = await request.json();
            return HttpResponse.json(
              {
                ...mockSubjectDetail,
                ...(body as object),
                id: "new-subject-id",
              },
              { status: 201 },
            );
          },
        ),
      );

      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/fachname/i), "Physik");
      await user.type(screen.getByLabelText(/kürzel/i), "PH");

      await user.click(screen.getByRole("button", { name: /fach erstellen/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/subjects");
      });
    });
  });

  describe("edit mode", () => {
    beforeEach(() => {
      mockParams = { id: "subject-1" };
    });

    it("loads subject from API on mount", async () => {
      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematics");
      });
    });

    it("displays form with pre-filled data for existing subject", async () => {
      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematics");
      });

      expect(screen.getByLabelText(/kürzel/i)).toHaveValue("MA");
      // Color should be displayed in ColorPicker
      expect(
        screen.getByRole("button", { name: /#3B82F6/i }),
      ).toBeInTheDocument();
    });

    it("shows delete button for existing subject", async () => {
      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematics");
      });

      expect(
        screen.getByRole("button", { name: /löschen/i }),
      ).toBeInTheDocument();
    });

    it("handles 404 not found gracefully", async () => {
      mockParams = { id: "non-existent" };

      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/subjects/:id`, () => {
          return HttpResponse.json(
            { message: "Subject not found" },
            { status: 404 },
          );
        }),
      );

      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });
  });

  describe("delete functionality", () => {
    beforeEach(() => {
      mockParams = { id: "subject-1" };
    });

    it("shows delete confirmation dialog", async () => {
      const user = userEvent.setup();

      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematics");
      });

      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/fach löschen\?/i)).toBeInTheDocument();
      });
    });

    it("deletes subject and navigates to list on confirm", async () => {
      const user = userEvent.setup();

      server.use(
        http.delete(`${API_BASE}/api/schools/:schoolId/subjects/:id`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<SubjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematics");
      });

      // Open delete dialog
      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/fach löschen\?/i)).toBeInTheDocument();
      });

      // Find the confirm button in the dialog (there might be two "Löschen" buttons)
      const dialogButtons = screen.getAllByRole("button", { name: /löschen/i });
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/subjects");
      });
    });
  });

  describe("loading and error states", () => {
    it("shows loading state while fetching in edit mode", () => {
      mockParams = { id: "subject-1" };

      render(<SubjectDetailPage />);

      // Should show loading initially
      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
    });
  });
});
