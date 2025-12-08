import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";
import { SubjectForm } from "./SubjectForm";

// Mock ResizeObserver for Radix UI components (Popover in ColorPicker)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
});

describe("SubjectForm", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isSubmitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders all form fields", () => {
      render(<SubjectForm {...defaultProps} />);

      expect(screen.getByLabelText(/fachname/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/kürzel/i)).toBeInTheDocument();
      // ColorPicker is a button component, not a form input - check for label and button
      expect(screen.getByText("Farbe")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /farbe auswählen/i }),
      ).toBeInTheDocument();
    });

    it("renders submit and cancel buttons", () => {
      render(<SubjectForm {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /fach erstellen/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /abbrechen/i }),
      ).toBeInTheDocument();
    });

    it("renders save button when editing existing subject", () => {
      render(
        <SubjectForm
          {...defaultProps}
          subject={{
            id: "123",
            name: "Mathematik",
            abbreviation: "MAT",
            color: "#3B82F6",
            isActive: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }}
        />,
      );

      expect(
        screen.getByRole("button", { name: /speichern/i }),
      ).toBeInTheDocument();
    });

    it("populates fields when editing existing subject", () => {
      render(
        <SubjectForm
          {...defaultProps}
          subject={{
            id: "123",
            name: "Mathematik",
            abbreviation: "MAT",
            color: "#3B82F6",
            isActive: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }}
        />,
      );

      expect(screen.getByLabelText(/fachname/i)).toHaveValue("Mathematik");
      expect(screen.getByLabelText(/kürzel/i)).toHaveValue("MAT");
      // ColorPicker shows the color value in the button
      expect(
        screen.getByRole("button", { name: /#3B82F6/i }),
      ).toBeInTheDocument();
    });
  });

  describe("validation", () => {
    it("calls onSubmit with valid data", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SubjectForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/fachname/i), "Mathematik");
      await user.type(screen.getByLabelText(/kürzel/i), "MAT");

      await user.click(screen.getByRole("button", { name: /fach erstellen/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Mathematik",
        abbreviation: "MAT",
        color: undefined,
        needsSpecialRoom: false,
      });
    });

    it("does not submit when required fields are empty (HTML5 validation)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SubjectForm {...defaultProps} onSubmit={onSubmit} />);

      // Fill only name, leave abbreviation empty
      await user.type(screen.getByLabelText(/fachname/i), "Mathematik");

      await user.click(screen.getByRole("button", { name: /fach erstellen/i }));

      // HTML5 validation prevents submission before Zod validation runs
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("trims whitespace from input fields", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SubjectForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/fachname/i), "  Mathematik  ");
      await user.type(screen.getByLabelText(/kürzel/i), "  mat  ");

      await user.click(screen.getByRole("button", { name: /fach erstellen/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Mathematik",
        abbreviation: "MAT", // Also auto-uppercased
        color: undefined,
        needsSpecialRoom: false,
      });
    });
  });

  describe("user interactions", () => {
    it("auto-uppercases abbreviation input", async () => {
      const user = userEvent.setup();
      render(<SubjectForm {...defaultProps} />);

      const abbreviationInput = screen.getByLabelText(/kürzel/i);
      await user.type(abbreviationInput, "mat");

      expect(abbreviationInput).toHaveValue("MAT");
    });

    it("disables buttons when submitting", () => {
      render(<SubjectForm {...defaultProps} isSubmitting />);

      expect(screen.getByRole("button", { name: /speichern/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /abbrechen/i })).toBeDisabled();
    });

    it("shows saving text when submitting", () => {
      render(
        <SubjectForm
          {...defaultProps}
          isSubmitting
          subject={{
            id: "123",
            name: "Mathematik",
            abbreviation: "MAT",
            color: "#3B82F6",
            isActive: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }}
        />,
      );

      expect(
        screen.getByRole("button", { name: /speichern\.\.\./i }),
      ).toBeInTheDocument();
    });
  });
});
