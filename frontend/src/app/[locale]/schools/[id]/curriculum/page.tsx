"use client";

import { Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  CurriculumEntryResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
} from "@/lib/types";

const AUTO_ASSIGN = "__auto__";

export default function CurriculumPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");

  // Reference data
  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);

  // State
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CurriculumEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Add dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClassId, setNewClassId] = useState("");
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newTeacherId, setNewTeacherId] = useState(AUTO_ASSIGN);
  const [newHours, setNewHours] = useState(1);
  const [saving, setSaving] = useState(false);

  // Load reference data on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
    ])
      .then(([termsData, classesData, subjectsData, teachersData]) => {
        setTerms(termsData);
        setClasses(classesData);
        setSubjects(subjectsData);
        setTeachers(teachersData);
        // Default to current term
        const current = termsData.find((term) => term.is_current);
        if (current) {
          setSelectedTermId(current.id);
        } else if (termsData.length > 0) {
          setSelectedTermId(termsData[0].id);
        }
      })
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient, schoolId, tc]);

  // Load entries when term changes
  const fetchEntries = useCallback(() => {
    if (!selectedTermId) return;
    setEntriesLoading(true);
    apiClient
      .get<CurriculumEntryResponse[]>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum`,
      )
      .then((data) => {
        setEntries(data);
      })
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => {
        setEntriesLoading(false);
      });
  }, [apiClient, schoolId, selectedTermId, tc]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Lookup helpers
  const className = (id: string) =>
    classes.find((c) => c.id === id)?.name ?? id;
  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? id;
  const teacherName = (id: string | null) => {
    if (!id) return t("autoAssign");
    const teacher = teachers.find((t) => t.id === id);
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : id;
  };

  async function handleCreate() {
    if (!selectedTermId || !newClassId || !newSubjectId || saving) return;
    setSaving(true);
    try {
      await apiClient.post(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum`,
        {
          term_id: selectedTermId,
          school_class_id: newClassId,
          subject_id: newSubjectId,
          teacher_id: newTeacherId === AUTO_ASSIGN ? null : newTeacherId,
          hours_per_week: newHours,
        },
      );
      toast.success(t("saved"));
      setDialogOpen(false);
      resetForm();
      fetchEntries();
    } catch {
      toast.error(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!selectedTermId) return;
    if (!confirm(t("deleteConfirm"))) return;
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum/${entryId}`,
      );
      toast.success(t("deleted"));
      fetchEntries();
    } catch {
      toast.error(tc("errorGeneric"));
    }
  }

  function resetForm() {
    setNewClassId("");
    setNewSubjectId("");
    setNewTeacherId(AUTO_ASSIGN);
    setNewHours(1);
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          {terms.length > 0 && (
            <Select
              value={selectedTermId ?? ""}
              onValueChange={setSelectedTermId}
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
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            disabled={!selectedTermId}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("addClass")}
          </Button>
        </div>
      </div>

      {entriesLoading ? (
        <p className="text-muted-foreground">{tc("loading")}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("class")}</TableHead>
                  <TableHead>{t("subject")}</TableHead>
                  <TableHead>{t("teacher")}</TableHead>
                  <TableHead>{t("hoursPerWeek")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {className(entry.school_class_id)}
                    </TableCell>
                    <TableCell>{subjectName(entry.subject_id)}</TableCell>
                    <TableCell>{teacherName(entry.teacher_id)}</TableCell>
                    <TableCell>{entry.hours_per_week}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {t("noEntries")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {entries.map((entry) => (
              <div
                key={`card-${entry.id}`}
                className="rounded-md border bg-card p-3"
              >
                <p className="font-medium">
                  {className(entry.school_class_id)} ·{" "}
                  {subjectName(entry.subject_id)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {t("teacher")}
                  </span>
                  <span>{teacherName(entry.teacher_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("hoursPerWeek")}
                  </span>
                  <span>{entry.hours_per_week}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {tc("remove")}
                  </Button>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                {t("noEntries")}
              </p>
            )}
          </div>
        </>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addClass")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("class")}</Label>
              <Select value={newClassId} onValueChange={setNewClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClass")} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("subject")}</Label>
              <Select value={newSubjectId} onValueChange={setNewSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectSubject")} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("teacher")}</Label>
              <Select value={newTeacherId} onValueChange={setNewTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTeacher")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_ASSIGN}>{t("autoAssign")}</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("hoursPerWeek")}</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={newHours}
                onChange={(e) => setNewHours(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newClassId || !newSubjectId || saving}
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
