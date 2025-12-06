import {
  BookOpen,
  Calendar,
  Clock,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { Separator } from "@/components/ui/separator";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
  { to: "settings", icon: Settings, labelKey: "settings" },
];

interface MobileNavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

function MobileNavItem({ to, icon: Icon, label }: MobileNavItemProps) {
  return (
    <SheetClose asChild>
      <NavLink to={to} className="group focus-visible:outline-none">
        {({ isActive }) => (
          <span
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
              "group-focus-visible:bg-accent group-focus-visible:text-accent-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
              "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              "h-9 px-4 py-2",
              "w-full justify-start gap-3",
              isActive
                ? "bg-secondary text-secondary-foreground shadow-sm"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </span>
        )}
      </NavLink>
    </SheetClose>
  );
}

export function MobileSidebar() {
  const { t, i18n } = useTranslation("nav");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">Klassenzeit</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {mainNavItems.map((item) => (
          <MobileNavItem
            key={item.to}
            to={`/${i18n.language}/${item.to}`}
            icon={item.icon}
            label={t(item.labelKey)}
          />
        ))}

        <Separator className="my-2" />

        {secondaryNavItems.map((item) => (
          <MobileNavItem
            key={item.to}
            to={`/${i18n.language}/${item.to}`}
            icon={item.icon}
            label={t(item.labelKey)}
          />
        ))}
      </nav>
    </div>
  );
}
