import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { ClassForm } from "./ClassForm";

// Mock ResizeObserver for Radix UI components (Select)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  // Mock hasPointerCapture for Radix UI Select components
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
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

describe("ClassForm", () => {
  const defaultProps = {
    schoolId: "test-school-id",
    onSubmit: vi.fn(),
    isSubmitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders all form fields", async () => {
      render(<ClassForm {...defaultProps} />);

      expect(screen.getByLabelText(/klassenname/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/klassenstufe/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/schüleranzahl/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/klassenlehrer/i)).toBeInTheDocument();
    });

    it("renders submit and cancel buttons", async () => {
      render(<ClassForm {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /abbrechen/i }),
      ).toBeInTheDocument();
    });

    it("renders save button when editing existing class", async () => {
      render(
        <ClassForm
          {...defaultProps}
          schoolClass={{
            id: "class-1",
            name: "5a",
            gradeLevel: 5,
            studentCount: 25,
            classTeacherId: "teacher-1",
            classTeacherName: "John Doe",
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

    it("populates fields when editing existing class", async () => {
      render(
        <ClassForm
          {...defaultProps}
          schoolClass={{
            id: "class-1",
            name: "5a",
            gradeLevel: 5,
            studentCount: 25,
            classTeacherId: "teacher-1",
            classTeacherName: "John Doe",
            isActive: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }}
        />,
      );

      expect(screen.getByLabelText(/klassenname/i)).toHaveValue("5a");
      expect(screen.getByLabelText(/klassenstufe/i)).toHaveValue(5);
      expect(screen.getByLabelText(/schüleranzahl/i)).toHaveValue(25);
    });
  });

  describe("teacher dropdown", () => {
    it("shows loading state while fetching teachers", () => {
      // Create a delayed handler
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/teachers`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json([]);
        }),
      );

      render(<ClassForm {...defaultProps} />);

      // The select should be disabled while loading
      const trigger = screen.getByRole("combobox", { name: /klassenlehrer/i });
      expect(trigger).toBeDisabled();
    });

    it("shows default 'None' value initially", async () => {
      render(<ClassForm {...defaultProps} />);

      // Wait for teachers to load
      await waitFor(() => {
        expect(screen.queryByText(/wird geladen/i)).not.toBeInTheDocument();
      });

      // The combobox should show "Keiner" as default value
      const trigger = screen.getByRole("combobox", { name: /klassenlehrer/i });
      expect(trigger).toHaveTextContent(/keiner/i);
    });

    it("disables teacher select while loading", () => {
      // Create a delayed handler
      server.use(
        http.get(`${API_BASE}/api/schools/:schoolId/teachers`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return HttpResponse.json([]);
        }),
      );

      render(<ClassForm {...defaultProps} />);

      const trigger = screen.getByRole("combobox", { name: /klassenlehrer/i });
      expect(trigger).toBeDisabled();
    });
  });

  describe("validation", () => {
    it("calls onSubmit with valid data", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ClassForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/klassenname/i), "7a");
      await user.type(screen.getByLabelText(/klassenstufe/i), "7");

      await user.click(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: "7a",
        gradeLevel: 7,
        studentCount: undefined,
        classTeacherId: undefined,
      });
    });

    it("does not submit when required fields are empty (HTML5 validation)", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ClassForm {...defaultProps} onSubmit={onSubmit} />);

      // Fill only name, leave gradeLevel empty
      await user.type(screen.getByLabelText(/klassenname/i), "7a");

      await user.click(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      );

      // HTML5 validation prevents submission before Zod validation runs
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("trims whitespace from name field", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ClassForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/klassenname/i), "  7a  ");
      await user.type(screen.getByLabelText(/klassenstufe/i), "7");

      await user.click(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: "7a",
        gradeLevel: 7,
        studentCount: undefined,
        classTeacherId: undefined,
      });
    });

    it("includes optional studentCount when provided", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ClassForm {...defaultProps} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/klassenname/i), "7a");
      await user.type(screen.getByLabelText(/klassenstufe/i), "7");
      await user.type(screen.getByLabelText(/schüleranzahl/i), "28");

      await user.click(
        screen.getByRole("button", { name: /klasse erstellen/i }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: "7a",
        gradeLevel: 7,
        studentCount: 28,
        classTeacherId: undefined,
      });
    });
  });

  describe("user interactions", () => {
    it("disables buttons when submitting", () => {
      render(<ClassForm {...defaultProps} isSubmitting />);

      expect(screen.getByRole("button", { name: /speichern/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /abbrechen/i })).toBeDisabled();
    });

    it("shows saving text when submitting", () => {
      render(
        <ClassForm
          {...defaultProps}
          isSubmitting
          schoolClass={{
            id: "class-1",
            name: "5a",
            gradeLevel: 5,
            studentCount: 25,
            classTeacherId: "teacher-1",
            classTeacherName: "John Doe",
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

    it("navigates back on cancel button click", async () => {
      const user = userEvent.setup();
      render(<ClassForm {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /abbrechen/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/de/classes");
    });
  });
});
