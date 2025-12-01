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
import { NavLink } from "react-router";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

interface MobileNavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

function MobileNavItem({ to, icon: Icon, label }: MobileNavItemProps) {
  return (
    <SheetClose asChild>
      <NavLink to={to}>
        {({ isActive }) => (
          <Button
            variant={isActive ? "secondary" : "ghost"}
            className={cn("w-full justify-start gap-3")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </Button>
        )}
      </NavLink>
    </SheetClose>
  );
}

export function MobileSidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">Klassenzeit</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {mainNavItems.map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}

        <Separator className="my-2" />

        {secondaryNavItems.map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}
