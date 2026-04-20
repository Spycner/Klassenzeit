import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  type LucideIcon,
  Pencil,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSchoolClasses } from "@/features/school-classes/hooks";
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

type EntityKind = "subject" | "room" | "teacher" | "weekScheme" | "schoolClass" | "stundentafel";

type EntityHref =
  | "/subjects"
  | "/rooms"
  | "/teachers"
  | "/week-schemes"
  | "/school-classes"
  | "/stundentafeln";

interface RecentEntry {
  id: string;
  kind: EntityKind;
  name: string;
  updatedAt: string;
  href: EntityHref;
}

const KIND_META: Record<EntityKind, { icon: LucideIcon; href: EntityHref }> = {
  subject: { icon: BookOpen, href: "/subjects" },
  room: { icon: DoorOpen, href: "/rooms" },
  teacher: { icon: UserRound, href: "/teachers" },
  weekScheme: { icon: CalendarDays, href: "/week-schemes" },
  schoolClass: { icon: GraduationCap, href: "/school-classes" },
  stundentafel: { icon: Pencil, href: "/stundentafeln" },
};

const MAX_ENTRIES = 5;
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

function formatRelativeUpdated(iso: string, now: Date, locale: string, t: TFunction): string {
  const diffSec = (new Date(iso).getTime() - now.getTime()) / 1000;
  if (Math.abs(diffSec) < 60) return t("dashboard.recentEntries.justNow");
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, seconds] of UNITS) {
    const value = diffSec / seconds;
    if (Math.abs(value) >= 1) {
      return fmt.format(Math.round(value), unit);
    }
  }
  return t("dashboard.recentEntries.justNow");
}

function formatAbsoluteUpdated(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function RecentlyEdited() {
  const { t, i18n } = useTranslation();
  const subjects = useSubjects();
  const rooms = useRooms();
  const teachers = useTeachers();
  const weekSchemes = useWeekSchemes();
  const schoolClasses = useSchoolClasses();
  const stundentafeln = useStundentafeln();

  const allLoading =
    subjects.isLoading &&
    rooms.isLoading &&
    teachers.isLoading &&
    weekSchemes.isLoading &&
    schoolClasses.isLoading &&
    stundentafeln.isLoading;

  const entries: RecentEntry[] = [
    ...(subjects.data ?? []).map<RecentEntry>((s) => ({
      id: s.id,
      kind: "subject",
      name: s.name,
      updatedAt: s.updated_at,
      href: "/subjects",
    })),
    ...(rooms.data ?? []).map<RecentEntry>((r) => ({
      id: r.id,
      kind: "room",
      name: r.name,
      updatedAt: r.updated_at,
      href: "/rooms",
    })),
    ...(teachers.data ?? []).map<RecentEntry>((te) => ({
      id: te.id,
      kind: "teacher",
      name: `${te.first_name} ${te.last_name}`,
      updatedAt: te.updated_at,
      href: "/teachers",
    })),
    ...(weekSchemes.data ?? []).map<RecentEntry>((w) => ({
      id: w.id,
      kind: "weekScheme",
      name: w.name,
      updatedAt: w.updated_at,
      href: "/week-schemes",
    })),
    ...(schoolClasses.data ?? []).map<RecentEntry>((c) => ({
      id: c.id,
      kind: "schoolClass",
      name: c.name,
      updatedAt: c.updated_at,
      href: "/school-classes",
    })),
    ...(stundentafeln.data ?? []).map<RecentEntry>((s) => ({
      id: s.id,
      kind: "stundentafel",
      name: s.name,
      updatedAt: s.updated_at,
      href: "/stundentafeln",
    })),
  ]
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, MAX_ENTRIES);

  const now = new Date();

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>
      {allLoading && entries.length === 0 ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-10 animate-pulse rounded bg-muted/50" />
          <div className="h-10 animate-pulse rounded bg-muted/50" />
          <div className="h-10 animate-pulse rounded bg-muted/50" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("dashboard.recentEntries.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {entries.map((entry) => {
            const Icon = KIND_META[entry.kind].icon;
            const typeLabel = t(`dashboard.recentEntries.types.${entry.kind}` as const);
            return (
              <li key={`${entry.kind}:${entry.id}`}>
                <Link
                  to={entry.href}
                  className="flex items-center gap-3 py-2 hover:bg-accent/40 rounded px-1"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">{typeLabel}</span>
                  </span>
                  <time
                    dateTime={entry.updatedAt}
                    title={formatAbsoluteUpdated(entry.updatedAt, i18n.language)}
                    className="text-xs text-muted-foreground"
                  >
                    {formatRelativeUpdated(entry.updatedAt, now, i18n.language, t)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
