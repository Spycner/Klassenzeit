import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, LayoutDashboard, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useLogout, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", icon: CalendarClock },
] as const;

export function AppShell({ children }: AppShellProps) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout.mutateAsync();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/30 p-4 flex flex-col">
        <div className="mb-6 text-lg font-semibold">Klassenzeit</div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                )}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-muted-foreground">{me.data ? me.data.email : "..."}</div>
          <Button variant="ghost" size="sm" onClick={handleLogout} disabled={logout.isPending}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
