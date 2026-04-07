"use client";

import { AlertTriangle, Check, Loader2, Play, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { ViewModeSelector } from "@/components/timetable/view-mode-selector";
import {
  ViolationsPanel,
  violationId,
} from "@/components/timetable/violations-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  RoomResponse,
  SchedulerStatusResponse,
  SchoolClassResponse,
  SolveResult,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
  TimetableViewMode,
  ViolationDto,
} from "@/lib/types";

export default function SchedulePage() {
  const params = useParams<{ id: string; locale: string }>();
  const schoolId = params.id;
  const locale = params.locale;
  const apiClient = useApiClient();
  const t = useTranslations("scheduler");
  const tc = useTranslations("common");

  // Reference data
  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);

  // State
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [status, setStatus] = useState<SchedulerStatusResponse | null>(null);
  const [solution, setSolution] = useState<SolveResult | null>(null);
  const [viewMode, setViewMode] = useState<TimetableViewMode>("class");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [highlighted, setHighlighted] = useState<{
    v: ViolationDto;
    id: string;
  } | null>(null);

  const highlightedCells = (() => {
    if (!highlighted) return undefined;
    const set = new Set<string>();
    for (const ref of highlighted.v.lesson_refs) {
      const ts = timeslots.find((t) => t.id === ref.timeslot_id);
      if (ts) set.add(`${ts.day_of_week}-${ts.period}`);
    }
    return set;
  })();

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  // Load reference data on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
      apiClient.get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`),
      apiClient.get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`),
    ])
      .then(
        ([
          termsData,
          classesData,
          subjectsData,
          teachersData,
          roomsData,
          timeslotsData,
        ]) => {
          setTerms(termsData);
          setClasses(classesData);
          setSubjects(subjectsData);
          setTeachers(teachersData);
          setRooms(roomsData);
          setTimeslots(timeslotsData);
          const current = termsData.find((term) => term.is_current);
          if (current) {
            setSelectedTermId(current.id);
          } else if (termsData.length > 0) {
            setSelectedTermId(termsData[0].id);
          }
          if (classesData.length > 0) {
            setSelectedEntityId(classesData[0].id);
          }
        },
      )
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient, schoolId, tc]);

  const fetchSolution = useCallback(
    (termId: string) => {
      apiClient
        .get<SolveResult>(
          `/api/schools/${schoolId}/terms/${termId}/scheduler/solution`,
        )
        .then((data) => {
          setSolution(data);
        })
        .catch(() => {
          toast.error(tc("errorGeneric"));
        });
    },
    [apiClient, schoolId, tc],
  );

  const startPolling = useCallback(
    (termId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        apiClient
          .get<SchedulerStatusResponse>(
            `/api/schools/${schoolId}/terms/${termId}/scheduler/status`,
          )
          .then((data) => {
            setStatus(data);
            if (data.status !== "solving") {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setSolving(false);
              if (data.status === "solved") {
                toast.success(t("solved"));
                fetchSolution(termId);
              } else if (data.status === "failed") {
                toast.error(t("failed"));
              }
            }
          })
          .catch(() => {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setSolving(false);
          });
      }, 2000);
    },
    [apiClient, schoolId, t, fetchSolution],
  );

  // Check status when term changes
  useEffect(() => {
    if (!selectedTermId) return;
    apiClient
      .get<SchedulerStatusResponse>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/status`,
      )
      .then((data) => {
        setStatus(data);
        if (data.status === "solving") {
          setSolving(true);
          startPolling(selectedTermId);
        } else if (data.status === "solved") {
          fetchSolution(selectedTermId);
        }
      })
      .catch(() => {
        // No status yet
        setStatus(null);
        setSolution(null);
      });
  }, [selectedTermId, apiClient, schoolId, startPolling, fetchSolution]);

  async function handleGenerate() {
    if (!selectedTermId || solving) return;
    setSolving(true);
    setSolution(null);
    setStatus(null);
    setHighlighted(null);
    try {
      await apiClient.post(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/solve`,
        {},
      );
      startPolling(selectedTermId);
    } catch (err: unknown) {
      setSolving(false);
      const message =
        err instanceof Error && err.message.includes("409")
          ? t("alreadySolving")
          : tc("errorGeneric");
      toast.error(message);
    }
  }

  async function handleApply() {
    if (!selectedTermId || applying) return;
    setApplying(true);
    try {
      const result = await apiClient.post<{ lessons_created: number }>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/apply`,
        {},
      );
      toast.success(
        `${t("applied")} (${result.lessons_created} ${t("lessonsCreated")})`,
      );
      setSolution(null);
      setStatus(null);
      setHighlighted(null);
      setApplyDialogOpen(false);
    } catch {
      toast.error(tc("errorGeneric"));
    } finally {
      setApplying(false);
    }
  }

  async function handleDiscard() {
    if (!selectedTermId) return;
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/solution`,
      );
      toast.success(t("discarded"));
      setSolution(null);
      setStatus(null);
      setHighlighted(null);
    } catch {
      toast.error(tc("errorGeneric"));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {terms.length > 0 && (
            <Select
              value={selectedTermId ?? ""}
              onValueChange={(val) => {
                setSelectedTermId(val);
                setSolution(null);
                setStatus(null);
                setHighlighted(null);
              }}
            >
              <SelectTrigger className="w-48">
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
            onClick={handleGenerate}
            disabled={!selectedTermId || solving}
          >
            {solving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {solving ? t("generating") : t("generate")}
          </Button>
        </div>
      </div>

      {/* Failed banner */}
      {status?.status === "failed" && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{status.error ?? t("failed")}</span>
        </div>
      )}

      {/* Solution preview */}
      {solution && status?.status === "solved" && (
        <div className="flex flex-col gap-4">
          {/* Score + actions */}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-4">
              {/* Hard violations badge */}
              <div className="flex items-center gap-2">
                {solution.score.hard_violations === 0 ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                <span className="font-medium">
                  {t("hardViolations")}: {solution.score.hard_violations}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDiscard}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("discard")}
              </Button>
              <Button size="sm" onClick={() => setApplyDialogOpen(true)}>
                {t("apply")}
              </Button>
            </div>
          </div>

          {/* Violations list */}
          {solution.violations.length > 0 ? (
            <ViolationsPanel
              violations={solution.violations}
              highlightedId={highlighted?.id ?? null}
              onHighlight={(v) => {
                if (!v) {
                  setHighlighted(null);
                  return;
                }
                const idx = solution.violations.indexOf(v);
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
            />
          ) : (
            <p className="text-sm text-green-600">{t("noViolations")}</p>
          )}

          {/* View mode selector + timetable grid */}
          <div className="flex flex-col gap-3">
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

            <TimetableGrid
              lessons={solution.timetable}
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
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!solution && !solving && status?.status !== "failed" && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{t("noSchedule")}</p>
        </div>
      )}

      {/* Solving spinner state */}
      {solving && (
        <div className="flex flex-1 items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{t("generating")}</p>
        </div>
      )}

      {/* Apply confirmation dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apply")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("applyConfirm")}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApplyDialogOpen(false)}
              disabled={applying}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
