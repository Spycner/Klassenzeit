"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { SchoolClassResponse, TeacherResponse } from "@/lib/types";

const NO_TEACHER = "__none__";

export function ClassesTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.classes");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<SchoolClassResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SchoolClassResponse | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState(1);
  const [studentCount, setStudentCount] = useState<number | "">("");
  const [classTeacherId, setClassTeacherId] = useState(NO_TEACHER);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SchoolClassResponse | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
    ])
      .then(([classesData, teachersData]) => {
        setItems(classesData);
        setTeachers(teachersData);
      })
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const teacherName = (id: string | null) => {
    if (!id) return "\u2014";
    const teacher = teachers.find((t) => t.id === id);
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : "\u2014";
  };

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setGradeLevel(1);
    setStudentCount("");
    setClassTeacherId(NO_TEACHER);
    setDialogOpen(true);
  }

  function openEditDialog(item: SchoolClassResponse) {
    setEditingItem(item);
    setName(item.name);
    setGradeLevel(item.grade_level);
    setStudentCount(item.student_count ?? "");
    setClassTeacherId(item.class_teacher_id ?? NO_TEACHER);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        grade_level: gradeLevel,
        student_count: studentCount === "" ? null : Number(studentCount),
        class_teacher_id: classTeacherId === NO_TEACHER ? null : classTeacherId,
      };
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/classes/${editingItem.id}`,
          body,
        );
      } else {
        await apiClient.post(`/api/schools/${schoolId}/classes`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/classes/${itemToDelete.id}`,
      );
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("gradeLevel")}</TableHead>
              <TableHead>{t("studentCount")}</TableHead>
              <TableHead>{t("classTeacher")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.grade_level}</TableCell>
                <TableCell>{item.student_count ?? "\u2014"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {teacherName(item.class_teacher_id)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setItemToDelete(item);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div
            key={`card-${item.id}`}
            className="rounded-md border bg-card p-3"
          >
            <div className="font-medium">{item.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("gradeLevel")}
                </div>
                <div>{item.grade_level}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("studentCount")}
                </div>
                <div>{item.student_count ?? "\u2014"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("classTeacher")}
                </div>
                <div>{teacherName(item.class_teacher_id)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => openEditDialog(item)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {tc("edit")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={() => {
                  setItemToDelete(item);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {tc("remove")}
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-md border bg-card py-8 text-center text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("editTitle") : t("addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("name")}</Label>
                <Input
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("gradeLevel")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={13}
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("studentCount")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={studentCount}
                  onChange={(e) =>
                    setStudentCount(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("classTeacher")}</Label>
                <Select
                  value={classTeacherId}
                  onValueChange={setClassTeacherId}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectTeacher")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>{t("noTeacher")}</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: itemToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
