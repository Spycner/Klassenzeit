import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { RoomsListPage } from "./RoomsListPage";

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

describe("RoomsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders room list correctly with data", async () => {
      render(<RoomsListPage />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Room 101")).toBeInTheDocument();
      });

      expect(screen.getByText("Room 102")).toBeInTheDocument();
      // Building column shows "Main" for both rooms
      const mainTexts = screen.getAllByText("Main");
      expect(mainTexts.length).toBeGreaterThan(0);
    });

    it("displays loading state while fetching", () => {
      render(<RoomsListPage />);

      // Loading text should be visible initially
      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
      // The page header and add button should be visible during loading
      expect(
        screen.getByRole("heading", { name: /räume/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /raum hinzufügen/i }),
      ).toBeInTheDocument();
    });

    it("handles empty state with proper message", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine räume/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/fügen sie ihren ersten raum hinzu/i),
      ).toBeInTheDocument();
    });

    it("shows error state on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        }),
      );

      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    it("renders capacity column correctly", async () => {
      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Room 101")).toBeInTheDocument();
      });

      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("renders dash for rooms without building or capacity", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
          return HttpResponse.json([
            {
              id: "room-3",
              name: "Room 201",
              building: null,
              capacity: null,
              isActive: true,
            },
          ]);
        }),
      );

      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Room 201")).toBeInTheDocument();
      });

      // Should show dashes for missing building and capacity
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBe(2);
    });

    it("renders active/inactive status badge", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
          return HttpResponse.json([
            {
              id: "room-1",
              name: "Room 101",
              building: "Main",
              capacity: 30,
              isActive: true,
            },
            {
              id: "room-2",
              name: "Room 102",
              building: "Main",
              capacity: 25,
              isActive: false,
            },
          ]);
        }),
      );

      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Room 101")).toBeInTheDocument();
      });

      // Status badges are rendered (the text may be i18n key or translated)
      // Use exact match to distinguish active from inactive
      expect(screen.getByText("active")).toBeInTheDocument();
      expect(screen.getByText("inactive")).toBeInTheDocument();
    });
  });

  describe("user interactions", () => {
    it("navigates to detail page on row click", async () => {
      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText("Room 101")).toBeInTheDocument();
      });

      // Click the row
      const row = screen.getByText("Room 101").closest("tr");
      row?.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/rooms/room-1");
    });

    it("opens create page via add room button", async () => {
      render(<RoomsListPage />);

      const addButton = screen.getByRole("button", {
        name: /raum hinzufügen/i,
      });
      addButton.click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/rooms/new");
    });

    it("opens create page via empty state button", async () => {
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
          return HttpResponse.json([]);
        }),
      );

      render(<RoomsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/noch keine räume/i)).toBeInTheDocument();
      });

      // Click the add button in empty state
      const buttons = screen.getAllByRole("button", {
        name: /raum hinzufügen/i,
      });
      buttons[buttons.length - 1].click();

      expect(mockNavigate).toHaveBeenCalledWith("/de/rooms/new");
    });
  });
});
