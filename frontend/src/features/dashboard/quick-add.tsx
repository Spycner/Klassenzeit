import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { BookOpen, CalendarDays, DoorOpen, GraduationCap, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuickAddItem {
  to: "/subjects" | "/rooms" | "/teachers" | "/week-schemes" | "/school-classes";
  icon: LucideIcon;
  labelKey:
    | "nav.subjects"
    | "nav.rooms"
    | "nav.teachers"
    | "nav.weekSchemes"
    | "sidebar.schoolClasses";
}

const ITEMS: QuickAddItem[] = [
  { to: "/subjects", icon: BookOpen, labelKey: "nav.subjects" },
  { to: "/rooms", icon: DoorOpen, labelKey: "nav.rooms" },
  { to: "/teachers", icon: GraduationCap, labelKey: "nav.teachers" },
  { to: "/week-schemes", icon: CalendarDays, labelKey: "nav.weekSchemes" },
  { to: "/school-classes", icon: Users, labelKey: "sidebar.schoolClasses" },
];

export function QuickAdd() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.quickAdd")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              search={{ create: "1" }}
              className="flex h-14 items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent"
            >
              <Icon className="h-4 w-4" />
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs text-muted-foreground">{t("common.new")}</span>
                <span>{t(item.labelKey)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
