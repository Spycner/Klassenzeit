"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import type { SchoolYearResponse, TermResponse } from "@/lib/types";

export function TermsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const locale = useLocale();
  const t = useTranslations("settings.terms");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<TermResponse[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TermResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [schoolYearId, setSchoolYearId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TermResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolYearResponse[]>(
        `/api/schools/${schoolId}/school-years`,
      ),
    ])
      .then(([termsData, schoolYearsData]) => {
        setItems(termsData);
        setSchoolYears(schoolYearsData);
      })
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setSchoolYearId(schoolYears.length > 0 ? schoolYears[0].id : "");
    setStartDate("");
    setEndDate("");
    setIsCurrent(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: TermResponse) {
    setEditingItem(item);
    setName(item.name);
    setSchoolYearId(item.school_year_id);
    setStartDate(item.start_date);
    setEndDate(item.end_date);
    setIsCurrent(item.is_current);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !schoolYearId || !startDate || !endDate || saving)
      return;
    setSaving(true);
    try {
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/terms/${editingItem.id}`,
          {
            name: name.trim(),
            start_date: startDate,
            end_date: endDate,
            is_current: isCurrent,
          },
        );
      } else {
        await apiClient.post(`/api/schools/${schoolId}/terms`, {
          school_year_id: schoolYearId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_current: isCurrent,
        });
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
        `/api/schools/${schoolId}/terms/${itemToDelete.id}`,
      );
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("409") ||
        msg.includes("conflict") ||
        msg.includes("referenced")
      ) {
        toast.error(t("deleteConflict"));
      } else {
        toast.error(tc("errorSaveData"));
      }
    } finally {
      setDeleting(false);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(locale);
    } catch {
      return dateStr;
    }
  };

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("startDate")}</TableHead>
            <TableHead>{t("endDate")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                {item.name}
                {item.is_current && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {t("currentBadge")}
                  </span>
                )}
              </TableCell>
              <TableCell>{formatDate(item.start_date)}</TableCell>
              <TableCell>{formatDate(item.end_date)}</TableCell>
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
                colSpan={4}
                className="py-8 text-center text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("editTitle") : t("addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            {!editingItem && (
              <div className="grid gap-2">
                <Label>{t("schoolYear")}</Label>
                <Select
                  value={schoolYearId}
                  onValueChange={setSchoolYearId}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectSchoolYear")} />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map((sy) => (
                      <SelectItem key={sy.id} value={sy.id}>
                        {sy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("startDate")}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("endDate")}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-current"
                checked={isCurrent}
                onChange={(e) => setIsCurrent(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="is-current">{t("isCurrent")}</Label>
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
              onClick={handleSave}
              disabled={
                !name.trim() ||
                !schoolYearId ||
                !startDate ||
                !endDate ||
                saving
              }
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
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
