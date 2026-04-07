"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import {
  loadPersistedView,
  ViewModeSelector,
} from "@/components/timetable/view-mode-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
  TimetableViewMode,
} from "@/lib/types";

export default function TimetablePage() {
  const params = useParams<{ id: string; locale: string }>();
  const schoolId = params.id;
  const locale = params.locale;
  const apiClient = useApiClient();
  const t = useTranslations("timetable");
  const tc = useTranslations("common");

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
  const [lessons, setLessons] = useState<LessonResponse[]>([]);

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<TimetableViewMode>("class");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load reference data
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
      .then(([termsData, cls, subs, tchs, rms, tss]) => {
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
      })
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  // Load lessons for the selected term
  useEffect(() => {
    if (!selectedTermId) return;
    apiClient
      .get<LessonResponse[]>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/lessons`,
      )
      .then(setLessons)
      .catch(() => {
        setLessons([]);
        toast.error(tc("errorGeneric"));
      });
  }, [apiClient, schoolId, selectedTermId, tc]);

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
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {terms.length > 0 && selectedTermId && (
          <Select
            value={selectedTermId}
            onValueChange={(val) => setSelectedTermId(val)}
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

      {lessons.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{t("noTimetable")}</p>
        </div>
      ) : (
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
        />
      )}
    </div>
  );
}
