"use client";

import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LessonEditDialog } from "@/components/timetable/lesson-edit-dialog";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { UndoToolbar } from "@/components/timetable/undo-toolbar";
import {
  loadPersistedView,
  persistMobileDay,
  ViewModeSelector,
} from "@/components/timetable/view-mode-selector";
import {
  ViolationsPanel,
  violationId,
} from "@/components/timetable/violations-panel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiClient } from "@/hooks/use-api-client";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  LessonResponse,
  ListLessonsResponse,
  PatchLessonRequest,
  PatchLessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SchoolResponse,
  SubjectResponse,
  SwapLessonsResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
  TimetableViewMode,
  ViolationDto,
} from "@/lib/types";

interface UndoEntry {
  lessonId: string;
  prev: {
    timeslot_id: string;
    room_id: string | null;
    teacher_id: string;
  };
}

const UNDO_LIMIT = 10;

export default function TimetablePage() {
  const params = useParams<{ id: string; locale: string }>();
  const schoolId = params.id;
  const locale = params.locale;
  const apiClient = useApiClient();
  const t = useTranslations("timetable");
  const te = useTranslations("timetable.edit");
  const tc = useTranslations("common");

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
  const [lessons, setLessons] = useState<LessonResponse[]>([]);
  const [violations, setViolations] = useState<ViolationDto[]>([]);

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<TimetableViewMode>("class");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [highlighted, setHighlighted] = useState<{
    v: ViolationDto;
    id: string;
  } | null>(null);

  const isAdmin = school?.role === "admin";

  const isMobile = useIsMobile();

  const [mobileDay, setMobileDay] = useState<number>(() => {
    const today = new Date().getDay(); // 0 Sun .. 6 Sat
    return today === 0 || today === 6 ? 0 : today - 1;
  });

  const highlightedCells = (() => {
    if (!highlighted) return undefined;
    const set = new Set<string>();
    for (const ref of highlighted.v.lesson_refs) {
      const ts = timeslots.find((ts) => ts.id === ref.timeslot_id);
      if (ts) set.add(`${ts.day_of_week}-${ts.period}`);
    }
    return set;
  })();

  // Load reference data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<SchoolResponse>(`/api/schools/${schoolId}`),
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
      apiClient.get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`),
      apiClient.get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`),
    ])
      .then(([schoolData, termsData, cls, subs, tchs, rms, tss]) => {
        setSchool(schoolData);
        setTerms(termsData);
        setClasses(cls);
        setSubjects(subs);
        setTeachers(tchs);
        setRooms(rms);
        setTimeslots(tss);
        const current = termsData.find((term) => term.is_current);
        const initialTerm = current ?? termsData[0];
        if (initialTerm) setSelectedTermId(initialTerm.id);

        // Restore view from localStorage if valid; otherwise default to first class.
        const persisted = loadPersistedView(schoolId);
        if (persisted && persisted.viewMode === "class") {
          setViewMode("class");
          setSelectedEntityId(persisted.selectedEntityId ?? cls[0]?.id ?? null);
        } else if (persisted && persisted.viewMode === "teacher") {
          setViewMode("teacher");
          setSelectedEntityId(
            persisted.selectedEntityId ?? tchs[0]?.id ?? null,
          );
        } else if (persisted && persisted.viewMode === "room") {
          setViewMode("room");
          setSelectedEntityId(persisted.selectedEntityId ?? rms[0]?.id ?? null);
        } else if (cls.length > 0) {
          setSelectedEntityId(cls[0].id);
        }

        if (
          persisted &&
          typeof persisted.mobileDay === "number" &&
          persisted.mobileDay >= 0 &&
          persisted.mobileDay <= 4
        ) {
          setMobileDay(persisted.mobileDay);
        }
      })
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  // Load lessons for the selected term (with violations)
  useEffect(() => {
    if (!selectedTermId) return;
    apiClient
      .get<ListLessonsResponse>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/lessons?include_violations=true`,
      )
      .then((data) => {
        setLessons(data.lessons);
        setViolations(data.violations);
        setUndoStack([]);
        setHighlighted(null);
      })
      .catch(() => {
        setLessons([]);
        setViolations([]);
        setUndoStack([]);
        setHighlighted(null);
        toast.error(tc("errorGeneric"));
      });
  }, [apiClient, schoolId, selectedTermId, tc]);

  const snapshotLesson = useCallback(
    (lessonId: string): UndoEntry | null => {
      const l = lessons.find((x) => x.id === lessonId);
      if (!l) return null;
      return {
        lessonId,
        prev: {
          timeslot_id: l.timeslot_id,
          room_id: l.room_id,
          teacher_id: l.teacher_id,
        },
      };
    },
    [lessons],
  );

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((stack) => {
      const next = [...stack, entry];
      if (next.length > UNDO_LIMIT) next.shift();
      return next;
    });
  }, []);

  const applyChangesLocal = useCallback(
    (lessonId: string, changes: PatchLessonRequest) => {
      setLessons((prev) =>
        prev.map((l) => {
          if (l.id !== lessonId) return l;
          const next: LessonResponse = { ...l };
          if (changes.timeslot_id !== undefined)
            next.timeslot_id = changes.timeslot_id;
          if (changes.teacher_id !== undefined)
            next.teacher_id = changes.teacher_id;
          if (changes.room_id !== undefined) next.room_id = changes.room_id;
          return next;
        }),
      );
    },
    [],
  );

  const patchLesson = useCallback(
    async (
      lessonId: string,
      changes: PatchLessonRequest,
      errorKey: "moveError" | "patchError",
    ) => {
      if (!selectedTermId) return;
      const snapshot = snapshotLesson(lessonId);
      if (!snapshot) return;
      // Optimistic
      applyChangesLocal(lessonId, changes);
      try {
        const res = await apiClient.patch<PatchLessonResponse>(
          `/api/schools/${schoolId}/terms/${selectedTermId}/lessons/${lessonId}`,
          changes,
        );
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonId ? res.lesson : l)),
        );
        setViolations(res.violations);
        pushUndo(snapshot);
      } catch {
        // Rollback
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lessonId
              ? {
                  ...l,
                  timeslot_id: snapshot.prev.timeslot_id,
                  room_id: snapshot.prev.room_id,
                  teacher_id: snapshot.prev.teacher_id,
                }
              : l,
          ),
        );
        toast.error(te(errorKey));
      }
    },
    [
      apiClient,
      applyChangesLocal,
      pushUndo,
      schoolId,
      selectedTermId,
      snapshotLesson,
      te,
    ],
  );

  const handleMove = useCallback(
    (lessonId: string, targetTimeslotId: string) => {
      if (!isAdmin) return;
      patchLesson(lessonId, { timeslot_id: targetTimeslotId }, "moveError");
    },
    [isAdmin, patchLesson],
  );

  const handleSwap = useCallback(
    async (lessonAId: string, lessonBId: string) => {
      if (!isAdmin || !selectedTermId) return;
      const snapA = snapshotLesson(lessonAId);
      const snapB = snapshotLesson(lessonBId);
      if (!snapA || !snapB) return;
      // Optimistic swap of timeslots
      setLessons((prev) =>
        prev.map((l) => {
          if (l.id === lessonAId)
            return { ...l, timeslot_id: snapB.prev.timeslot_id };
          if (l.id === lessonBId)
            return { ...l, timeslot_id: snapA.prev.timeslot_id };
          return l;
        }),
      );
      try {
        const res = await apiClient.post<SwapLessonsResponse>(
          `/api/schools/${schoolId}/terms/${selectedTermId}/lessons/swap`,
          { lesson_a_id: lessonAId, lesson_b_id: lessonBId },
        );
        setLessons((prev) => {
          const map = new Map(res.lessons.map((l) => [l.id, l]));
          return prev.map((l) => map.get(l.id) ?? l);
        });
        setViolations(res.violations);
        // Push both snapshots so two undo steps revert the swap.
        pushUndo(snapB);
        pushUndo(snapA);
      } catch {
        // Rollback
        setLessons((prev) =>
          prev.map((l) => {
            if (l.id === lessonAId)
              return {
                ...l,
                timeslot_id: snapA.prev.timeslot_id,
                room_id: snapA.prev.room_id,
                teacher_id: snapA.prev.teacher_id,
              };
            if (l.id === lessonBId)
              return {
                ...l,
                timeslot_id: snapB.prev.timeslot_id,
                room_id: snapB.prev.room_id,
                teacher_id: snapB.prev.teacher_id,
              };
            return l;
          }),
        );
        toast.error(te("swapError"));
      }
    },
    [
      apiClient,
      isAdmin,
      pushUndo,
      schoolId,
      selectedTermId,
      snapshotLesson,
      te,
    ],
  );

  const handleEdit = useCallback(
    (lessonId: string) => {
      if (!isAdmin) return;
      setEditingLessonId(lessonId);
    },
    [isAdmin],
  );

  const handleEditSubmit = useCallback(
    async (changes: PatchLessonRequest) => {
      if (!editingLessonId) return;
      const id = editingLessonId;
      setEditingLessonId(null);
      await patchLesson(id, changes, "patchError");
    },
    [editingLessonId, patchLesson],
  );

  const handleUndo = useCallback(async () => {
    if (!selectedTermId || undoStack.length === 0) return;
    const top = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    const current = lessons.find((l) => l.id === top.lessonId);
    if (!current) return;
    const changes: PatchLessonRequest = {};
    if (current.timeslot_id !== top.prev.timeslot_id)
      changes.timeslot_id = top.prev.timeslot_id;
    if (current.teacher_id !== top.prev.teacher_id)
      changes.teacher_id = top.prev.teacher_id;
    if ((current.room_id ?? null) !== (top.prev.room_id ?? null))
      changes.room_id = top.prev.room_id;
    if (Object.keys(changes).length === 0) return;
    // Optimistic
    applyChangesLocal(top.lessonId, changes);
    try {
      const res = await apiClient.patch<PatchLessonResponse>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/lessons/${top.lessonId}`,
        changes,
      );
      setLessons((prev) =>
        prev.map((l) => (l.id === top.lessonId ? res.lesson : l)),
      );
      setViolations(res.violations);
    } catch {
      // Rollback
      setLessons((prev) =>
        prev.map((l) =>
          l.id === top.lessonId
            ? {
                ...l,
                timeslot_id: current.timeslot_id,
                room_id: current.room_id,
                teacher_id: current.teacher_id,
              }
            : l,
        ),
      );
      toast.error(te("patchError"));
    }
  }, [
    apiClient,
    applyChangesLocal,
    lessons,
    schoolId,
    selectedTermId,
    te,
    undoStack,
  ]);

  const editingLesson = editingLessonId
    ? (lessons.find((l) => l.id === editingLessonId) ?? null)
    : null;

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            {t("description")}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          {isAdmin && (
            <UndoToolbar canUndo={undoStack.length > 0} onUndo={handleUndo} />
          )}
          {terms.length > 0 && selectedTermId && (
            <Select
              value={selectedTermId}
              onValueChange={(val) => setSelectedTermId(val)}
            >
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <ViewModeSelector
        schoolId={schoolId}
        viewMode={viewMode}
        selectedEntityId={selectedEntityId}
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={({ viewMode: m, selectedEntityId: e }) => {
          setViewMode(m);
          setSelectedEntityId(e);
        }}
      />

      {violations.length > 0 && (
        <ViolationsPanel
          violations={violations}
          highlightedId={highlighted?.id ?? null}
          onHighlight={(v) => {
            if (!v) {
              setHighlighted(null);
              return;
            }
            const idx = violations.indexOf(v);
            const id = violationId(v, idx);
            setHighlighted({ v, id });
            const teacherKinds = new Set([
              "teacher_conflict",
              "teacher_unavailable",
              "teacher_over_capacity",
              "teacher_unqualified",
              "teacher_gap",
              "not_preferred_slot",
            ]);
            const roomKinds = new Set([
              "room_capacity",
              "room_unsuitable",
              "room_too_small",
            ]);
            const ref = v.lesson_refs[0];
            const ts = timeslots.find((slot) => slot.id === ref?.timeslot_id);
            if (ts && typeof ts.day_of_week === "number") {
              setMobileDay(ts.day_of_week);
              persistMobileDay(schoolId, ts.day_of_week);
            }
            if (teacherKinds.has(v.kind) && ref) {
              setViewMode("teacher");
              setSelectedEntityId(ref.teacher_id);
            } else if (roomKinds.has(v.kind) && ref?.room_id) {
              setViewMode("room");
              setSelectedEntityId(ref.room_id);
            } else if (ref) {
              setViewMode("class");
              setSelectedEntityId(ref.class_id);
            }
          }}
          refs={{
            teachers,
            classes,
            rooms,
            subjects,
            timeslots,
            locale,
          }}
          schoolId={schoolId}
        />
      )}

      <div className="printable-timetable">
        {lessons.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">{t("noTimetable")}</p>
          </div>
        ) : (
          <>
            {isMobile && (
              <div className="mb-3 grid grid-cols-5 gap-1 rounded-md border p-1">
                {(locale === "de"
                  ? ["Mo", "Di", "Mi", "Do", "Fr"]
                  : ["Mon", "Tue", "Wed", "Thu", "Fri"]
                ).map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setMobileDay(idx);
                      persistMobileDay(schoolId, idx);
                    }}
                    className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                      mobileDay === idx
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    aria-pressed={mobileDay === idx}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <TimetableGrid
              lessons={lessons}
              viewMode={viewMode}
              selectedEntityId={selectedEntityId}
              timeslots={timeslots}
              subjects={subjects}
              teachers={teachers}
              rooms={rooms}
              classes={classes}
              locale={locale}
              highlightedCells={highlightedCells}
              highlightTone={
                highlighted?.v.severity === "soft" ? "warn" : "error"
              }
              editable={isAdmin && !isMobile}
              visibleDays={isMobile ? [mobileDay] : undefined}
              onLessonMove={handleMove}
              onLessonSwap={handleSwap}
              onLessonEdit={handleEdit}
            />
          </>
        )}
      </div>

      <LessonEditDialog
        open={editingLesson !== null}
        lesson={editingLesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => setEditingLessonId(null)}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
}
