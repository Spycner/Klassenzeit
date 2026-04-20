import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { SubjectMultiPicker } from "./subject-multi-picker";

function wrapSubjectPicker(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("SubjectMultiPicker", () => {
  test("renders selected subjects as chips", async () => {
    render(
      wrapSubjectPicker(
        <SubjectMultiPicker value={["11111111-1111-1111-1111-111111111111"]} onChange={vi.fn()} />,
      ),
    );
    expect(await screen.findByText("Mathematik")).toBeInTheDocument();
  });

  test("filters the add list by search input", async () => {
    render(wrapSubjectPicker(<SubjectMultiPicker value={[]} onChange={vi.fn()} />));
    await screen.findByText("Mathematik");
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, "nope");
    await waitFor(() => expect(screen.queryByText("Mathematik")).not.toBeInTheDocument());
  });

  test("clicking an unselected subject adds it", async () => {
    const onChange = vi.fn();
    render(wrapSubjectPicker(<SubjectMultiPicker value={[]} onChange={onChange} />));
    const entry = await screen.findByRole("button", { name: /Mathematik/ });
    await userEvent.click(entry);
    expect(onChange).toHaveBeenCalledWith(["11111111-1111-1111-1111-111111111111"]);
  });

  test("clicking an active chip removes it", async () => {
    const onChange = vi.fn();
    render(
      wrapSubjectPicker(
        <SubjectMultiPicker value={["11111111-1111-1111-1111-111111111111"]} onChange={onChange} />,
      ),
    );
    const chip = await screen.findByRole("button", { name: /remove Mathematik/i });
    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
