import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";
// Note: waitFor is still imported but only used for onSubmit verification
import { TeacherForm } from "./TeacherForm";

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

describe("TeacherForm", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isSubmitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders all form fields", () => {
      render(<TeacherForm {...defaultProps} />);

      expect(screen.getByLabelText(/vorname/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/nachname/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/kürzel/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max.*stunden/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/teilzeitkraft/i)).toBeInTheDocument();
    });

    it("renders submit and cancel buttons", () => {
      render(<TeacherForm {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /lehrkraft erstellen/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /abbrechen/i }),
      ).toBeInTheDocument();
    });

    it("renders save button when editing existing teacher", () => {
      render(
        <TeacherForm
          {...defaultProps}
          teacher={{
            id: "123",
            firstName: "Max",
            lastName: "Mustermann",
            abbreviation: "MUS",
            email: "max@school.de",
            maxHoursPerWeek: null,
            isPartTime: false,
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

    it("populates fields when editing existing teacher", () => {
      render(
        <TeacherForm
          {...defaultProps}
          teacher={{
            id: "123",
            firstName: "Max",
            lastName: "Mustermann",
            abbreviation: "MUS",
            email: "max@school.de",
            maxHoursPerWeek: 25,
            isPartTime: true,
            isActive: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }}
        />,
      );

      expect(screen.getByLabelText(/vorname/i)).toHaveValue("Max");
      expect(screen.getByLabelText(/nachname/i)).toHaveValue("Mustermann");
      expect(screen.getByLabelText(/kürzel/i)).toHaveValue("MUS");
      expect(screen.getByLabelText(/e-mail/i)).toHaveValue("max@school.de");
      expect(screen.getByLabelText(/max.*stunden/i)).toHaveValue(25);
    });
  });

  describe("validation", () => {
    it("calls onSubmit with valid data", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TeacherForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/vorname/i), "Max");
      await user.type(screen.getByLabelText(/nachname/i), "Mustermann");
      await user.type(screen.getByLabelText(/kürzel/i), "MUS");

      await user.click(
        screen.getByRole("button", { name: /lehrkraft erstellen/i }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        firstName: "Max",
        lastName: "Mustermann",
        abbreviation: "MUS",
        email: undefined,
        maxHoursPerWeek: undefined,
        isPartTime: undefined,
      });
    });

    it("does not submit when required fields are empty (HTML5 validation)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TeacherForm {...defaultProps} onSubmit={onSubmit} />);

      // Fill only first name, leave others empty
      await user.type(screen.getByLabelText(/vorname/i), "Max");

      await user.click(
        screen.getByRole("button", { name: /lehrkraft erstellen/i }),
      );

      // HTML5 validation prevents submission before Zod validation runs
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not submit when email is invalid (HTML5 validation)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TeacherForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/vorname/i), "Max");
      await user.type(screen.getByLabelText(/nachname/i), "Mustermann");
      await user.type(screen.getByLabelText(/kürzel/i), "MUS");
      await user.type(screen.getByLabelText(/e-mail/i), "invalid-email");

      await user.click(
        screen.getByRole("button", { name: /lehrkraft erstellen/i }),
      );

      // HTML5 email validation should prevent submission
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not submit when maxHoursPerWeek exceeds max (HTML5 + Zod validation)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TeacherForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/vorname/i), "Max");
      await user.type(screen.getByLabelText(/nachname/i), "Mustermann");
      await user.type(screen.getByLabelText(/kürzel/i), "MUS");
      await user.type(screen.getByLabelText(/max.*stunden/i), "51");

      await user.click(
        screen.getByRole("button", { name: /lehrkraft erstellen/i }),
      );

      // HTML5 max validation and/or Zod validation prevents submission
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("user interactions", () => {
    it("auto-uppercases abbreviation input", async () => {
      const user = userEvent.setup();
      render(<TeacherForm {...defaultProps} />);

      const abbreviationInput = screen.getByLabelText(/kürzel/i);
      await user.type(abbreviationInput, "abc");

      expect(abbreviationInput).toHaveValue("ABC");
    });

    it("disables buttons when submitting", () => {
      render(<TeacherForm {...defaultProps} isSubmitting />);

      expect(screen.getByRole("button", { name: /speichern/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /abbrechen/i })).toBeDisabled();
    });

    it("shows saving text when submitting", () => {
      render(
        <TeacherForm
          {...defaultProps}
          isSubmitting
          teacher={{
            id: "123",
            firstName: "Max",
            lastName: "Mustermann",
            abbreviation: "MUS",
            email: "max@school.de",
            maxHoursPerWeek: null,
            isPartTime: false,
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
