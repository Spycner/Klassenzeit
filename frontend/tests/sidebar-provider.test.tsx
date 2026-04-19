import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SidebarProvider, useSidebar } from "@/components/sidebar-provider";

function wrap({ children }: { children: ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("SidebarProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to not collapsed", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    expect(result.current.collapsed).toBe(false);
  });

  it("restores collapsed state from localStorage", () => {
    localStorage.setItem("kz_sidebar_collapsed", "1");
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle flips state and persists", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: wrap });
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("0");
  });
});
