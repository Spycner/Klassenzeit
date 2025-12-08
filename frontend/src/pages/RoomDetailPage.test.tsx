import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockRoomDetail } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { RoomDetailPage } from "./RoomDetailPage";

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

describe("RoomDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
  });

  describe("create mode", () => {
    beforeEach(() => {
      mockParams = {}; // No id = create mode
    });

    it("renders form without loading room details", async () => {
      render(<RoomDetailPage />);

      // Should show "Neuer Raum" title
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neuer raum/i }),
        ).toBeInTheDocument();
      });

      // Form should be empty
      expect(screen.getByLabelText(/raumname/i)).toHaveValue("");
    });

    it("does not render delete button in create mode", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neuer raum/i }),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: /löschen/i }),
      ).not.toBeInTheDocument();
    });

    it("does not show SubjectSuitabilitySection in create mode", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /neuer raum/i }),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText(/facheignung/i)).not.toBeInTheDocument();
    });

    it("creates room and navigates to edit page on success", async () => {
      const user = userEvent.setup();

      server.use(
        http.post(
          `${API_BASE}/api/schools/:schoolId/rooms`,
          async ({ request }) => {
            const body = await request.json();
            return HttpResponse.json(
              {
                ...mockRoomDetail,
                ...(body as object),
                id: "new-room-id",
              },
              { status: 201 },
            );
          },
        ),
      );

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/raumname/i), "Room 201");

      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/rooms/new-room-id", {
          replace: true,
        });
      });
    });
  });

  describe("edit mode", () => {
    beforeEach(() => {
      mockParams = { id: "room-1" };
    });

    it("loads room from API on mount", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });
    });

    it("displays form with pre-filled data for existing room", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      expect(screen.getByLabelText(/gebäude/i)).toHaveValue("Main");
      expect(screen.getByLabelText(/kapazität/i)).toHaveValue(30);
    });

    it("shows delete button for existing room", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      expect(
        screen.getByRole("button", { name: /löschen/i }),
      ).toBeInTheDocument();
    });

    it("shows SubjectSuitabilitySection in edit mode", async () => {
      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      expect(screen.getByText(/fach-eignung/i)).toBeInTheDocument();
    });

    it("handles 404 not found gracefully", async () => {
      mockParams = { id: "non-existent" };

      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/rooms/:id`, () => {
          return HttpResponse.json(
            { message: "Room not found" },
            { status: 404 },
          );
        }),
      );

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/fehler/i)).toBeInTheDocument();
      });
    });

    it("updates room on form submit", async () => {
      const user = userEvent.setup();

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      // Clear and type new name
      await user.clear(screen.getByLabelText(/raumname/i));
      await user.type(screen.getByLabelText(/raumname/i), "Room 101 Updated");

      await user.click(screen.getByRole("button", { name: /speichern/i }));

      // Should stay on page after update (no navigation to list)
      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });
  });

  describe("delete functionality", () => {
    beforeEach(() => {
      mockParams = { id: "room-1" };
    });

    it("shows delete confirmation dialog", async () => {
      const user = userEvent.setup();

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/raum löschen\?/i)).toBeInTheDocument();
      });
    });

    it("deletes room and navigates to list on confirm", async () => {
      const user = userEvent.setup();

      server.use(
        http.delete(`${API_BASE}/api/schools/:schoolId/rooms/:id`, () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      // Open delete dialog
      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/raum löschen\?/i)).toBeInTheDocument();
      });

      // Find the confirm button in the dialog (there might be two "Löschen" buttons)
      const dialogButtons = screen.getAllByRole("button", { name: /löschen/i });
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/de/rooms");
      });
    });

    it("closes dialog on cancel", async () => {
      const user = userEvent.setup();

      render(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      });

      // Open delete dialog
      await user.click(screen.getByRole("button", { name: /löschen/i }));

      await waitFor(() => {
        expect(screen.getByText(/raum löschen\?/i)).toBeInTheDocument();
      });

      // Click cancel
      await user.click(screen.getByRole("button", { name: /abbrechen/i }));

      await waitFor(() => {
        expect(screen.queryByText(/raum löschen\?/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("loading and error states", () => {
    it("shows loading state while fetching in edit mode", () => {
      mockParams = { id: "room-1" };

      render(<RoomDetailPage />);

      // Should show loading initially
      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
    });
  });
});
