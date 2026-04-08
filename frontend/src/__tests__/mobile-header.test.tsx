import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MobileHeader } from "@/components/layout/mobile-header";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/schools/abc/timetable",
}));

const messages = {
  school: {
    dashboard: "Dashboard",
    members: "Members",
  },
  curriculum: { title: "Curriculum" },
  scheduler: { title: "Scheduler" },
  timetable: { title: "Timetable" },
  settings: { title: "Settings" },
};

function wrap(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SidebarProvider>{node}</SidebarProvider>
    </NextIntlClientProvider>
  );
}

describe("MobileHeader", () => {
  it("renders the route title and sidebar trigger", () => {
    render(wrap(<MobileHeader />));
    expect(screen.getByText("Timetable")).toBeInTheDocument();
    // SidebarTrigger renders a button with an accessible name including "sidebar"
    expect(
      screen.getByRole("button", { name: /sidebar/i }),
    ).toBeInTheDocument();
  });
});
