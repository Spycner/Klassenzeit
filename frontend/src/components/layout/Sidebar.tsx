import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NavItem } from "./NavItem";

const mainNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/teachers", icon: Users, label: "Teachers" },
  { to: "/subjects", icon: BookOpen, label: "Subjects" },
  { to: "/rooms", icon: DoorOpen, label: "Rooms" },
  { to: "/classes", icon: GraduationCap, label: "Classes" },
  { to: "/timeslots", icon: Clock, label: "Time Slots" },
  { to: "/timetable", icon: Calendar, label: "Timetable" },
];

const secondaryNavItems = [
  { to: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex h-full flex-col border-r bg-background transition-all duration-300",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-3">
          {!collapsed && (
            <span className="text-lg font-semibold">Klassenzeit</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn("h-8 w-8", collapsed && "mx-auto")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {mainNavItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          <Separator className="my-2" />

          {secondaryNavItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
