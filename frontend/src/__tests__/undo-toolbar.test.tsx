import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const _tCache = new Map<string, ReturnType<typeof makeT>>();

function makeT(ns: string) {
  const fn = (k: string) => `${ns}.${k}`;
  fn.raw = (k: string) => `${ns}.${k}`;
  return fn;
}

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = makeT(ns);
      _tCache.set(ns, fn);
    }
    return fn;
  },
}));

import { UndoToolbar } from "@/components/timetable/undo-toolbar";

describe("UndoToolbar", () => {
  it("button disabled when canUndo is false", () => {
    const { getByRole } = render(
      <UndoToolbar canUndo={false} onUndo={() => {}} />,
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onUndo when clicked", () => {
    const onUndo = vi.fn();
    const { getByRole } = render(
      <UndoToolbar canUndo={true} onUndo={onUndo} />,
    );
    fireEvent.click(getByRole("button"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
