import {
  BookOpen,
  Building2,
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
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NavItem } from "./NavItem";

const mainNavItems = [
  { to: "dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { to: "teachers", icon: Users, labelKey: "teachers" },
  { to: "subjects", icon: BookOpen, labelKey: "subjects" },
  { to: "rooms", icon: DoorOpen, labelKey: "rooms" },
  { to: "classes", icon: GraduationCap, labelKey: "classes" },
  { to: "timeslots", icon: Clock, labelKey: "timeSlots" },
  { to: "timetable", icon: Calendar, labelKey: "timetable" },
];

const secondaryNavItems = [
  { to: "schools", icon: Building2, labelKey: "schools" },
  { to: "settings", icon: Settings, labelKey: "settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t, i18n } = useTranslation("nav");

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
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
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
            <NavItem
              key={item.to}
              to={`/${i18n.language}/${item.to}`}
              icon={item.icon}
              label={t(item.labelKey)}
              collapsed={collapsed}
            />
          ))}

          <Separator className="my-2" />

          {secondaryNavItems.map((item) => (
            <NavItem
              key={item.to}
              to={`/${i18n.language}/${item.to}`}
              icon={item.icon}
              label={t(item.labelKey)}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
