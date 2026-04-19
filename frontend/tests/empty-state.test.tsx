import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("renders title, body, three steps, and calls onCreate when clicked", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <EmptyState
        icon={<svg data-testid="glyph" aria-hidden />}
        title="No rooms yet"
        body="Create a room so the solver knows where lessons take place."
        steps={["Add a room", "Mark specialized rooms", "Set availability"]}
        createLabel="New room"
        onCreate={onCreate}
      />,
    );
    expect(screen.getByText("No rooms yet")).toBeVisible();
    expect(screen.getByText(/create a room so the solver/i)).toBeVisible();
    expect(screen.getByText("Add a room")).toBeVisible();
    expect(screen.getByText("Mark specialized rooms")).toBeVisible();
    expect(screen.getByText("Set availability")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /new room/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
