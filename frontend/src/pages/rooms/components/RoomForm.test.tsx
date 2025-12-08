import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockRoomDetail } from "@/test/mocks/handlers";
import { render, screen, waitFor } from "@/test/test-utils";
import { RoomForm } from "./RoomForm";

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
  };
});

describe("RoomForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  describe("rendering", () => {
    it("renders all form fields", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      expect(screen.getByLabelText(/raumname/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/gebäude/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/kapazität/i)).toBeInTheDocument();
    });

    it("renders empty form in create mode", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      expect(screen.getByLabelText(/raumname/i)).toHaveValue("");
      expect(screen.getByLabelText(/gebäude/i)).toHaveValue("");
      expect(screen.getByLabelText(/kapazität/i)).toHaveValue(null);
    });

    it("pre-fills form with existing room data", () => {
      render(
        <RoomForm
          room={mockRoomDetail}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
        />,
      );

      expect(screen.getByLabelText(/raumname/i)).toHaveValue("Room 101");
      expect(screen.getByLabelText(/gebäude/i)).toHaveValue("Main");
      expect(screen.getByLabelText(/kapazität/i)).toHaveValue(30);
    });

    it("shows 'Raum erstellen' button text in create mode", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      expect(
        screen.getByRole("button", { name: /raum erstellen/i }),
      ).toBeInTheDocument();
    });

    it("shows 'Speichern' button text in edit mode", () => {
      render(
        <RoomForm
          room={mockRoomDetail}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
        />,
      );

      expect(
        screen.getByRole("button", { name: /speichern/i }),
      ).toBeInTheDocument();
    });

    it("shows 'Speichern...' when submitting", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={true} />);

      expect(
        screen.getByRole("button", { name: /speichern\.\.\./i }),
      ).toBeInTheDocument();
    });
  });

  describe("form submission", () => {
    it("submits form with valid data", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/raumname/i), "Room 201");
      await user.type(screen.getByLabelText(/gebäude/i), "Annex");
      await user.type(screen.getByLabelText(/kapazität/i), "25");

      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: "Room 201",
          building: "Annex",
          capacity: 25,
        });
      });
    });

    it("submits form with only required fields", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/raumname/i), "Room 301");

      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: "Room 301",
          building: undefined,
          capacity: undefined,
        });
      });
    });

    it("trims whitespace from text fields", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/raumname/i), "  Room 401  ");
      await user.type(screen.getByLabelText(/gebäude/i), "  Main  ");

      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: "Room 401",
          building: "Main",
          capacity: undefined,
        });
      });
    });

    it("converts empty building string to undefined", async () => {
      const user = userEvent.setup();

      render(
        <RoomForm
          room={{ ...mockRoomDetail, building: "Main" }}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
        />,
      );

      // Clear building field
      await user.clear(screen.getByLabelText(/gebäude/i));

      await user.click(screen.getByRole("button", { name: /speichern/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            building: undefined,
          }),
        );
      });
    });

    it("disables submit button while submitting", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={true} />);

      expect(
        screen.getByRole("button", { name: /speichern\.\.\./i }),
      ).toBeDisabled();
    });

    it("disables cancel button while submitting", () => {
      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={true} />);

      expect(screen.getByRole("button", { name: /abbrechen/i })).toBeDisabled();
    });
  });

  describe("navigation", () => {
    it("navigates back to rooms list on cancel", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.click(screen.getByRole("button", { name: /abbrechen/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/de/rooms");
    });
  });

  describe("validation", () => {
    it("requires name field", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      // Try to submit without filling name
      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      // Form should not submit
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("allows capacity with minimum value of 1", async () => {
      const user = userEvent.setup();

      render(<RoomForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/raumname/i), "Room 101");
      await user.type(screen.getByLabelText(/kapazität/i), "1");

      await user.click(screen.getByRole("button", { name: /raum erstellen/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            capacity: 1,
          }),
        );
      });
    });
  });
});
