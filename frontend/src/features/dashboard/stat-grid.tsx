import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

export function StatGrid() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const teachers = useTeachers();
  const subjects = useSubjects();
  const weekSchemes = useWeekSchemes();

  const items = [
    { label: t("dashboard.stats.classes"), value: "0", hint: t("sidebar.comingSoon") },
    {
      label: t("dashboard.stats.teachers"),
      value: formatCount(teachers.data?.length),
      hint: statHint(teachers.data?.length, t("dashboard.hint.noTeachersSub")),
    },
    {
      label: t("dashboard.stats.rooms"),
      value: formatCount(rooms.data?.length),
      hint: statHint(rooms.data?.length, t("dashboard.hint.noRoomsSub")),
    },
    {
      label: t("dashboard.stats.subjects"),
      value: formatCount(subjects.data?.length),
      hint: statHint(subjects.data?.length, t("dashboard.hint.noSubjectsSub")),
    },
    {
      label: t("nav.weekSchemes"),
      value: formatCount(weekSchemes.data?.length),
      hint: statHint(weekSchemes.data?.length, t("dashboard.hint.noWeekSchemeSub")),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          <span className="text-3xl font-bold tracking-tight">{item.value}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.hint}</span>
        </div>
      ))}
    </div>
  );
}

function formatCount(value: number | undefined) {
  if (value === undefined) return "…";
  return new Intl.NumberFormat().format(value);
}

function statHint(count: number | undefined, emptyHint: string) {
  if (count === undefined) return "";
  if (count === 0) return emptyHint;
  return "";
}
