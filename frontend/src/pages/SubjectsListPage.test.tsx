import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { SubjectsListPage } from "./SubjectsListPage";

// Mock ResizeObserver for any Radix UI components
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
  };
});

const API_BASE = "http://localhost:8080";

describe("SubjectsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders subject list correctly with data", async () => {
      render(<SubjectsListPage />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Mathematics")).toBeInTheDocument();
      });

      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.getByText("MA")).toBeInTheDocument();
      expect(screen.getByText("EN")).toBeInTheDocument();
    });

    it("displays loading state while fetching", () => {
      render(<SubjectsListPage />);

      // Loading text should be visible initially
      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
      // The page header and add button should be visible during loading
      expect(
        screen.getByRole("heading", { name: /fächer/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /fach hinzufügen/i }),
      ).toBeInTheDocument();
    });

    it("handles empty state with proper message", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/subjects`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine fächer/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/fügen sie ihr erstes fach hinzu/i),
      ).toBeInTheDocument();
    });

    it("shows error state on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/subjects`, () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        }),
      );

      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    it("renders color column correctly with hex value", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/subjects`, () => {
          return HttpResponse.json([
            {
              id: "subject-1",
              name: "Mathematics",
              abbreviation: "MA",
              color: "#3B82F6",
            },
          ]);
        }),
      );

      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText("#3B82F6")).toBeInTheDocument();
      });
    });

    it("renders dash for subjects without color", async () => {
      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Mathematics")).toBeInTheDocument();
      });

      // mockSubjects don't have colors, so should show dashes
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("user interactions", () => {
    it("navigates to detail page on row click", async () => {
      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Mathematics")).toBeInTheDocument();
      });

      // Click the row
      const row = screen.getByText("Mathematics").closest("tr");
      row?.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/subjects/subject-1");
    });

    it("opens create page via add subject button", async () => {
      render(<SubjectsListPage />);

      const addButton = screen.getByRole("button", {
        name: /fach hinzufügen/i,
      });
      addButton.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/subjects/new");
    });

    it("opens create page via empty state button", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/subjects`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<SubjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine fächer/i)).toBeInTheDocument();
      });

      // Click the add button in empty state
      const buttons = screen.getAllByRole("button", {
        name: /fach hinzufügen/i,
      });
      buttons[buttons.length - 1].click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/subjects/new");
    });
  });
});
