"use client";

import { Calendar, Pencil, Plus, Trash2 } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { TeacherResponse, TimeSlotResponse } from "@/lib/types";
import { TeacherAvailabilityDialog } from "./teacher-availability-dialog";

export function TeachersTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.teachers");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");
  const tAvailability = useTranslations("settings.teachers.availability");

  const [items, setItems] = useState<TeacherResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TeacherResponse | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [email, setEmail] = useState("");
  const [maxHours, setMaxHours] = useState(28);
  const [isPartTime, setIsPartTime] = useState(false);

  // Availability dialog state
  const [availabilityTeacher, setAvailabilityTeacher] =
    useState<TeacherResponse | null>(null);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TeacherResponse | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    apiClient
      .get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`)
      .then(setTimeslots)
      .catch(() => {});
  }, [apiClient, schoolId]);

  // Deep-link focus handling: ?focus=<id> scrolls the row into view and
  // briefly highlights it.
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!focusId || items.length === 0) return;
    const el = rowRefs.current.get(focusId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-yellow-100", "transition-colors");
      const timer = setTimeout(() => {
        el.classList.remove("bg-yellow-100");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [focusId, items]);

  function openAddDialog() {
    setEditingItem(null);
    setFirstName("");
    setLastName("");
    setAbbreviation("");
    setEmail("");
    setMaxHours(28);
    setIsPartTime(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: TeacherResponse) {
    setEditingItem(item);
    setFirstName(item.first_name);
    setLastName(item.last_name);
    setAbbreviation(item.abbreviation);
    setEmail(item.email ?? "");
    setMaxHours(item.max_hours_per_week);
    setIsPartTime(item.is_part_time);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !abbreviation.trim() || saving)
      return;
    setSaving(true);
    try {
      const body = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        abbreviation: abbreviation.trim(),
        email: email.trim() || null,
        max_hours_per_week: maxHours,
        is_part_time: isPartTime,
      };
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/teachers/${editingItem.id}`,
          body,
        );
      } else {
        await apiClient.post(`/api/schools/${schoolId}/teachers`, body);
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
        `/api/schools/${schoolId}/teachers/${itemToDelete.id}`,
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("abbreviation")}</TableHead>
            <TableHead>{t("firstName")}</TableHead>
            <TableHead>{t("lastName")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("maxHours")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
            >
              <TableCell className="font-medium">{item.abbreviation}</TableCell>
              <TableCell>{item.first_name}</TableCell>
              <TableCell>{item.last_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {item.email ?? "\u2014"}
              </TableCell>
              <TableCell>
                {item.max_hours_per_week}
                {item.is_part_time && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {t("partTimeBadge")}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAvailabilityTeacher(item)}
                    aria-label={tAvailability("button_label")}
                    title={tAvailability("button_tooltip")}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
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
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("editTitle") : t("addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("firstName")}</Label>
                <Input
                  placeholder={t("firstNamePlaceholder")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("lastName")}</Label>
                <Input
                  placeholder={t("lastNamePlaceholder")}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("abbreviation")}</Label>
                <Input
                  placeholder={t("abbreviationPlaceholder")}
                  value={abbreviation}
                  onChange={(e) => setAbbreviation(e.target.value)}
                  maxLength={5}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("email")}</Label>
                <Input
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("maxHours")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={maxHours}
                  onChange={(e) => setMaxHours(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  id="is-part-time"
                  checked={isPartTime}
                  onChange={(e) => setIsPartTime(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4"
                />
                <Label htmlFor="is-part-time">{t("isPartTime")}</Label>
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
            <Button
              onClick={handleSave}
              disabled={
                !firstName.trim() ||
                !lastName.trim() ||
                !abbreviation.trim() ||
                saving
              }
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", {
                name: `${itemToDelete?.first_name ?? ""} ${itemToDelete?.last_name ?? ""}`,
              })}
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

      <TeacherAvailabilityDialog
        teacher={availabilityTeacher}
        timeslots={timeslots}
        open={!!availabilityTeacher}
        onOpenChange={(o) => {
          if (!o) setAvailabilityTeacher(null);
        }}
      />
    </>
  );
}
