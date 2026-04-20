import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebar } from "@/components/app-sidebar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SidebarProvider } from "@/components/sidebar-provider";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-7 py-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function TopBar() {
  const { t } = useTranslation();
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const crumbKey = currentCrumbKey(last?.pathname ?? "/");
  return (
    <div className="sticky top-0 z-10 flex h-13 items-center justify-between border-b bg-background px-6 py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Klassenzeit</span>
        <span className="opacity-50">/</span>
        <span className="font-medium text-foreground">{t(crumbKey)}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
}

function currentCrumbKey(pathname: string) {
  if (pathname.startsWith("/subjects")) return "nav.subjects";
  if (pathname.startsWith("/rooms")) return "nav.rooms";
  if (pathname.startsWith("/teachers")) return "nav.teachers";
  if (pathname.startsWith("/week-schemes")) return "nav.weekSchemes";
  if (pathname.startsWith("/school-classes")) return "sidebar.schoolClasses";
  if (pathname.startsWith("/stundentafeln")) return "sidebar.stundentafeln";
  if (pathname.startsWith("/lessons")) return "sidebar.lessons";
  return "nav.dashboard";
}
