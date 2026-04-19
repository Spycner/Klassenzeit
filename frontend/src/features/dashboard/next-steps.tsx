import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BookOpen, CalendarDays, DoorOpen, GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

interface NextStep {
  key: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  to: "/subjects" | "/rooms" | "/teachers" | "/week-schemes";
}

export function NextSteps() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const rooms = useRooms();
  const weekSchemes = useWeekSchemes();

  const pending: NextStep[] = [];
  if ((subjects.data?.length ?? 0) === 0) {
    pending.push({
      key: "noSubjects",
      icon: BookOpen,
      title: t("dashboard.hint.noSubjects"),
      sub: t("dashboard.hint.noSubjectsSub"),
      to: "/subjects",
    });
  }
  if ((rooms.data?.length ?? 0) === 0) {
    pending.push({
      key: "noRooms",
      icon: DoorOpen,
      title: t("dashboard.hint.noRooms"),
      sub: t("dashboard.hint.noRoomsSub"),
      to: "/rooms",
    });
  }
  if ((teachers.data?.length ?? 0) === 0) {
    pending.push({
      key: "noTeachers",
      icon: GraduationCap,
      title: t("dashboard.hint.noTeachers"),
      sub: t("dashboard.hint.noTeachersSub"),
      to: "/teachers",
    });
  }
  if ((weekSchemes.data?.length ?? 0) === 0) {
    pending.push({
      key: "noWeekScheme",
      icon: CalendarDays,
      title: t("dashboard.hint.noWeekScheme"),
      sub: t("dashboard.hint.noWeekSchemeSub"),
      to: "/week-schemes",
    });
  }

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{t("dashboard.nextSteps")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.nextStepsSub")}</p>
      </div>
      <ul>
        {pending.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.key}
              className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </div>
              <Link
                to={item.to}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
              >
                {t("common.open")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
