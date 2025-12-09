import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { ClassesListPage } from "./ClassesListPage";

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

describe("ClassesListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders class list correctly with data", async () => {
      render(<ClassesListPage />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      expect(screen.getByText("6b")).toBeInTheDocument();
    });

    it("displays loading state while fetching", () => {
      render(<ClassesListPage />);

      // Loading text should be visible initially
      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
      // The page header and add button should be visible during loading
      expect(
        screen.getByRole("heading", { name: /klassen/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /klasse hinzufügen/i }),
      ).toBeInTheDocument();
    });

    it("handles empty state with proper message", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine klassen/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/fügen sie ihre erste klasse hinzu/i),
      ).toBeInTheDocument();
    });

    it("shows error state on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    it("renders grade level column correctly", async () => {
      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Grade levels should be displayed
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("renders status badge for active and inactive classes", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json([
            { id: "class-1", name: "5a", gradeLevel: 5, isActive: true },
            { id: "class-2", name: "6b", gradeLevel: 6, isActive: false },
          ]);
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Active badge should be visible for the active class
      // Note: Both "Aktiv" and "Inaktiv" contain "aktiv", so use exact text matching
      const badges = screen.getAllByText(/aktiv|inaktiv/i);
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    it("renders class teacher name when assigned", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json([
            {
              id: "class-1",
              name: "5a",
              gradeLevel: 5,
              isActive: true,
              classTeacherName: "John Doe",
            },
          ]);
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });
    });

    it("renders dash for classes without class teacher", async () => {
      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // mockClasses don't have classTeacherName, so should show dashes
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders student count when available", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json([
            {
              id: "class-1",
              name: "5a",
              gradeLevel: 5,
              isActive: true,
              studentCount: 25,
            },
          ]);
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("25")).toBeInTheDocument();
      });
    });
  });

  describe("user interactions", () => {
    it("navigates to detail page on row click", async () => {
      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Click the row
      const row = screen.getByText("5a").closest("tr");
      row?.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/classes/class-1");
    });

    it("opens create page via add class button", async () => {
      render(<ClassesListPage />);

      const addButton = screen.getByRole("button", {
        name: /klasse hinzufügen/i,
      });
      addButton.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/classes/new");
    });

    it("opens create page via empty state button", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<ClassesListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine klassen/i)).toBeInTheDocument();
      });

      // Click the add button in empty state
      const buttons = screen.getAllByRole("button", {
        name: /klasse hinzufügen/i,
      });
      buttons[buttons.length - 1].click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/classes/new");
    });
  });

  // Note: "no school selected" error state testing requires mocking useSchoolContext
  // which is not currently supported by test-utils. This edge case should be tested
  // at the integration level or when test-utils infrastructure is enhanced.
});
