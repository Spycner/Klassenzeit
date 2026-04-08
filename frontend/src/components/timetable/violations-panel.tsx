"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ResourceRefDto,
  RoomResponse,
  SchoolClassResponse,
  Severity,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  ViolationDto,
  ViolationKind,
} from "@/lib/types";

interface Refs {
  teachers: TeacherResponse[];
  classes: SchoolClassResponse[];
  rooms: RoomResponse[];
  subjects: SubjectResponse[];
  timeslots: TimeSlotResponse[];
  locale: string;
}

interface ViolationsPanelProps {
  violations: ViolationDto[];
  highlightedId: string | null;
  onHighlight: (v: ViolationDto | null) => void;
  refs: Refs;
  schoolId: string;
}

export function FixLinks({
  violation,
  schoolId,
  locale,
  fixCtaText,
}: {
  violation: ViolationDto;
  schoolId: string;
  locale: string;
  fixCtaText: { teacher: string; room: string; subject: string };
}) {
  const links: { label: string; href: string; key: string }[] = [];
  for (const r of violation.resources) {
    if (r.type === "teacher") {
      links.push({
        key: `teacher-${r.id}`,
        label: fixCtaText.teacher,
        href: `/${locale}/schools/${schoolId}/settings?tab=teachers&focus=${r.id}`,
      });
    } else if (r.type === "room") {
      links.push({
        key: `room-${r.id}`,
        label: fixCtaText.room,
        href: `/${locale}/schools/${schoolId}/settings?tab=rooms&focus=${r.id}`,
      });
    } else if (r.type === "subject") {
      links.push({
        key: `subject-${r.id}`,
        label: fixCtaText.subject,
        href: `/${locale}/schools/${schoolId}/settings?tab=subjects&focus=${r.id}`,
      });
    }
  }
  if (links.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {links.map((l) => (
        <li key={l.key}>
          <a className="text-primary underline" href={l.href}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function violationId(v: ViolationDto, i: number): string {
  return `${v.kind}-${i}`;
}

function resolveResourceLabel(r: ResourceRefDto, refs: Refs): string {
  switch (r.type) {
    case "teacher": {
      const t = refs.teachers.find((x) => x.id === r.id);
      return t ? `${t.first_name} ${t.last_name}` : r.id;
    }
    case "class":
      return refs.classes.find((x) => x.id === r.id)?.name ?? r.id;
    case "room":
      return refs.rooms.find((x) => x.id === r.id)?.name ?? r.id;
    case "subject":
      return refs.subjects.find((x) => x.id === r.id)?.name ?? r.id;
    case "timeslot": {
      const ts = refs.timeslots.find((x) => x.id === r.id);
      return ts ? `Day ${ts.day_of_week + 1} P${ts.period}` : r.id;
    }
  }
}

const ALL_HARD: ViolationKind[] = [
  "teacher_conflict",
  "class_conflict",
  "room_capacity",
  "teacher_unavailable",
  "class_unavailable",
  "teacher_over_capacity",
  "teacher_unqualified",
  "room_unsuitable",
  "room_too_small",
  "unplaced_lesson",
  "no_qualified_teacher",
];
const ALL_SOFT: ViolationKind[] = [
  "teacher_gap",
  "subject_clustered",
  "not_preferred_slot",
  "class_teacher_first_period",
];

type IndexedViolation = { v: ViolationDto; id: string };

export function ViolationsPanel({
  violations,
  highlightedId,
  onHighlight,
  refs,
  schoolId,
}: ViolationsPanelProps) {
  const t = useTranslations("scheduler.violationsPanel");
  const [tab, setTab] = useState<Severity>("hard");

  const indexed: IndexedViolation[] = violations.map((v, i) => ({
    v,
    id: violationId(v, i),
  }));
  const hard = indexed.filter((x) => x.v.severity === "hard");
  const soft = indexed.filter((x) => x.v.severity === "soft");

  const groupByKind = (
    items: IndexedViolation[],
    allowed: ViolationKind[],
  ): Array<[ViolationKind, IndexedViolation[]]> => {
    const groups = new Map<ViolationKind, IndexedViolation[]>();
    for (const k of allowed) groups.set(k, []);
    for (const it of items) {
      const arr = groups.get(it.v.kind) ?? [];
      arr.push(it);
      groups.set(it.v.kind, arr);
    }
    return Array.from(groups.entries()).filter(([, v]) => v.length > 0);
  };

  const renderGroups = (
    items: IndexedViolation[],
    allowed: ViolationKind[],
  ) => {
    const groups = groupByKind(items, allowed);
    if (groups.length === 0) {
      return <p className="p-3 text-sm text-muted-foreground">{t("empty")}</p>;
    }
    return (
      <div className="flex flex-col gap-3 p-3">
        {groups.map(([kind, list]) => (
          <section key={kind} className="rounded-md border">
            <header className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">
                {t(`kind.${kind}.title`)}
              </span>
              <Badge variant="secondary">{list.length}</Badge>
            </header>
            <ul>
              {list.map(({ v, id }) => {
                const isSelected = highlightedId === id;
                return (
                  <li key={id} className="border-b last:border-b-0">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onHighlight(v)}
                        className={`flex flex-1 flex-col items-start gap-1 text-left text-sm ${
                          isSelected ? "font-semibold" : ""
                        }`}
                      >
                        <span>{t(`kind.${v.kind}.title`)}</span>
                        <div className="flex flex-wrap gap-1">
                          {v.resources.map((r, idx) => (
                            <Badge
                              key={`${id}-r-${r.type}-${r.id}-${idx}`}
                              variant="outline"
                              className="break-words text-xs"
                            >
                              {resolveResourceLabel(r, refs)}
                            </Badge>
                          ))}
                        </div>
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {t("fixCta")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm">
                          <p className="mb-2">{t(`kind.${v.kind}.fix`)}</p>
                          <FixLinks
                            violation={v}
                            schoolId={schoolId}
                            locale={refs.locale}
                            fixCtaText={{
                              teacher: t("openTeacher"),
                              room: t("openRoom"),
                              subject: t("openSubject"),
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Severity)}>
      <TabsList>
        <TabsTrigger value="hard">
          {t("tabs.hard", { count: hard.length })}
        </TabsTrigger>
        <TabsTrigger value="soft">
          {t("tabs.soft", { count: soft.length })}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="hard">{renderGroups(hard, ALL_HARD)}</TabsContent>
      <TabsContent value="soft">{renderGroups(soft, ALL_SOFT)}</TabsContent>
    </Tabs>
  );
}
