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
import type { TimeSlotResponse } from "@/lib/types";

const DAYS = [0, 1, 2, 3, 4, 5] as const;

export function TimeslotsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.timeslots");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<TimeSlotResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TimeSlotResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [period, setPeriod] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");
  const [isBreak, setIsBreak] = useState(false);
  const [label, setLabel] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TimeSlotResponse | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const dayName = (day: number) => t(`days.${day}`);

  function openAddDialog() {
    setEditingItem(null);
    setDayOfWeek("0");
    setPeriod(1);
    setStartTime("08:00");
    setEndTime("08:45");
    setIsBreak(false);
    setLabel("");
    setDialogOpen(true);
  }

  function openEditDialog(item: TimeSlotResponse) {
    setEditingItem(item);
    setDayOfWeek(String(item.day_of_week));
    setPeriod(item.period);
    setStartTime(item.start_time);
    setEndTime(item.end_time);
    setIsBreak(item.is_break);
    setLabel(item.label ?? "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!startTime || !endTime || saving) return;
    setSaving(true);
    try {
      const body = {
        day_of_week: Number(dayOfWeek),
        period,
        start_time: startTime,
        end_time: endTime,
        is_break: isBreak,
        label: label.trim() || null,
      };
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/timeslots/${editingItem.id}`,
          body,
        );
      } else {
        await apiClient.post(`/api/schools/${schoolId}/timeslots`, body);
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
        `/api/schools/${schoolId}/timeslots/${itemToDelete.id}`,
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
              <TableHead>{t("day")}</TableHead>
              <TableHead>{t("period")}</TableHead>
              <TableHead>
                {t("startTime")}\u2013{t("endTime")}
              </TableHead>
              <TableHead>{t("label")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {dayName(item.day_of_week)}
                </TableCell>
                <TableCell>
                  {item.period}
                  {item.is_break && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                      {t("breakBadge")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {item.start_time}\u2013{item.end_time}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.label ?? "\u2014"}
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
            <div className="font-medium">
              {dayName(item.day_of_week)} &middot; {t("period")} {item.period}
              {item.is_break && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t("breakBadge")}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("startTime")}\u2013{t("endTime")}
                </div>
                <div>
                  {item.start_time}\u2013{item.end_time}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("label")}
                </div>
                <div>{item.label ?? "\u2014"}</div>
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
                <Label>{t("day")}</Label>
                <Select
                  value={dayOfWeek}
                  onValueChange={setDayOfWeek}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {dayName(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("period")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("startTime")}</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("endTime")}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("label")}</Label>
              <Input
                placeholder={t("labelPlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-break"
                checked={isBreak}
                onChange={(e) => setIsBreak(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="is-break">{t("isBreak")}</Label>
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
              disabled={!startTime || !endTime || saving}
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm")}</DialogDescription>
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
