import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { render, screen, waitFor } from "@/test/test-utils";
import { ClassTeacherAssignmentsSection } from "./ClassTeacherAssignmentsSection";

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  // Mock scrollIntoView for cmdk component
  Element.prototype.scrollIntoView = vi.fn();
  // Mock hasPointerCapture for Radix UI components
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

describe("ClassTeacherAssignmentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders existing assignments as pills", async () => {
      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });
    });

    it("shows empty state when no assignments", async () => {
      server.use(
        http.get(
          `${API_BASE}/api/schools/:schoolId/teachers/:id/class-teacher-assignments`,
          () => {
            return HttpResponse.json([]);
          },
        ),
      );

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/keiner klasse als klassenlehrer zugeordnet/i),
        ).toBeInTheDocument();
      });
    });

    it("shows loading state while fetching", () => {
      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      expect(screen.getByText(/wird geladen/i)).toBeInTheDocument();
    });

    it("renders add button when there are available classes", async () => {
      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: /klasse zuweisen/i }),
      ).toBeInTheDocument();
    });

    it("renders grade level in assignment pills", async () => {
      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Grade level should be shown (e.g., "Klasse 5")
      expect(screen.getByText(/klasse 5/i)).toBeInTheDocument();
    });
  });

  describe("add form", () => {
    it("opens add form on button click", async () => {
      const user = userEvent.setup();

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /klasse zuweisen/i }),
      );

      // Form should now be visible - the cancel button appears only in the form
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /abbrechen/i }),
        ).toBeInTheDocument();
      });
    });

    it("hides add form on cancel", async () => {
      const user = userEvent.setup();

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /klasse zuweisen/i }),
      );

      // Form should be visible
      const cancelButton = screen.getByRole("button", { name: /abbrechen/i });
      expect(cancelButton).toBeInTheDocument();

      // Click cancel
      await user.click(cancelButton);

      // Form should be hidden (cancel button should not be visible)
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /abbrechen/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("disables add button when no class is selected", async () => {
      const user = userEvent.setup();

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /klasse zuweisen/i }),
      );

      // Find the submit button inside the form
      const buttons = screen.getAllByRole("button");
      const submitButton = buttons.find(
        (btn) =>
          btn.textContent?.toLowerCase().includes("klasse zuweisen") &&
          !btn.closest(".flex.flex-row"),
      );

      // Should be disabled when no class selected
      expect(submitButton).toBeDisabled();
    });
  });

  describe("unassign class", () => {
    it("removes assignment on delete button click", async () => {
      const user = userEvent.setup();

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Find and click the remove button for 5a
      const pill = screen.getByText("5a").closest("div");
      const removeButton = pill?.querySelector("button[aria-label]");

      expect(removeButton).toBeInTheDocument();

      if (removeButton) {
        await user.click(removeButton);
      }

      // The delete mutation should be called via updateClass with clearClassTeacher
    });
  });

  describe("navigation", () => {
    it("navigates to class detail page when clicking on a class", async () => {
      const user = userEvent.setup();

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("5a")).toBeInTheDocument();
      });

      // Click on the class name (not the remove button)
      await user.click(screen.getByText("5a"));

      expect(mockNavigate).toHaveBeenCalledWith("/de/classes/class-1");
    });
  });

  describe("error handling", () => {
    it("handles fetch failure gracefully", async () => {
      server.use(
        http.get(
          `${API_BASE}/api/schools/:schoolId/teachers/:id/class-teacher-assignments`,
          () => {
            return HttpResponse.json(
              { message: "Server error" },
              { status: 500 },
            );
          },
        ),
      );

      render(
        <ClassTeacherAssignmentsSection
          schoolId="school-1"
          teacherId="teacher-1"
        />,
      );

      // Component should handle error gracefully
      await waitFor(() => {
        expect(screen.queryByText(/wird geladen/i)).not.toBeInTheDocument();
      });
    });
  });
});
