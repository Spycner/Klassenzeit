"use client";

import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
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
import type {
  RoomResponse,
  SubjectResponse,
  TimeSlotResponse,
  TimeslotCapacityOverride,
} from "@/lib/types";
import { RoomSuitabilityDialog } from "./room-suitability-dialog";
import { TimeslotCapacityGrid } from "./timeslot-capacity-grid";

export function RoomsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.rooms");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");
  const tSuitability = useTranslations("settings.rooms.suitability");

  const [items, setItems] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoomResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [building, setBuilding] = useState("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [maxConcurrent, setMaxConcurrent] = useState<number>(1);

  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
  const [capacityOverrides, setCapacityOverrides] = useState<
    TimeslotCapacityOverride[]
  >([]);

  // Suitability dialog state
  const [suitabilityRoom, setSuitabilityRoom] = useState<RoomResponse | null>(
    null,
  );
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<RoomResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`)
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

  useEffect(() => {
    apiClient
      .get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`)
      .then(setSubjects)
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
    setName("");
    setBuilding("");
    setCapacity("");
    setMaxConcurrent(1);
    setCapacityOverrides([]);
    setDialogOpen(true);
  }

  async function openEditDialog(item: RoomResponse) {
    setEditingItem(item);
    setName(item.name);
    setBuilding(item.building ?? "");
    setCapacity(item.capacity ?? "");
    setMaxConcurrent(item.max_concurrent);
    try {
      const overrides = await apiClient.get<TimeslotCapacityOverride[]>(
        `/api/schools/${schoolId}/rooms/${item.id}/timeslot-capacities`,
      );
      setCapacityOverrides(overrides);
    } catch {
      setCapacityOverrides([]);
    }
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        building: building.trim() || null,
        capacity: capacity === "" ? null : Number(capacity),
        max_concurrent: maxConcurrent,
      };
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/rooms/${editingItem.id}`,
          body,
        );
        await apiClient.put(
          `/api/schools/${schoolId}/rooms/${editingItem.id}/timeslot-capacities`,
          capacityOverrides,
        );
      } else {
        const created = await apiClient.post<RoomResponse>(
          `/api/schools/${schoolId}/rooms`,
          body,
        );
        if (capacityOverrides.length > 0) {
          await apiClient.put(
            `/api/schools/${schoolId}/rooms/${created.id}/timeslot-capacities`,
            capacityOverrides,
          );
        }
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
        `/api/schools/${schoolId}/rooms/${itemToDelete.id}`,
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
              <TableHead>{t("building")}</TableHead>
              <TableHead>{t("capacity")}</TableHead>
              <TableHead>{t("maxConcurrent")}</TableHead>
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
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.building ?? "\u2014"}
                </TableCell>
                <TableCell>{item.capacity ?? "\u2014"}</TableCell>
                <TableCell>{item.max_concurrent}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSuitabilityRoom(item)}
                      aria-label={tSuitability("button_label")}
                      title={tSuitability("button_tooltip")}
                    >
                      <BookOpen className="h-4 w-4" />
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
            ref={(el) => {
              if (el) rowRefs.current.set(item.id, el);
            }}
            className="rounded-md border bg-card p-3"
          >
            <div className="font-medium">{item.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("building")}
                </div>
                <div>{item.building ?? "\u2014"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("capacity")}
                </div>
                <div>{item.capacity ?? "\u2014"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("maxConcurrent")}
                </div>
                <div>{item.max_concurrent}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setSuitabilityRoom(item)}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {tSuitability("button_label")}
              </Button>
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
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("building")}</Label>
                <Input
                  placeholder={t("buildingPlaceholder")}
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("capacity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) =>
                    setCapacity(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("maxConcurrent")}</Label>
              <Input
                type="number"
                min={0}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value) || 0)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {t("maxConcurrentHint")}
              </p>
            </div>
            <TimeslotCapacityGrid
              timeslots={timeslots}
              maxConcurrent={maxConcurrent}
              overrides={capacityOverrides}
              onChange={setCapacityOverrides}
              disabled={saving}
            />
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

      <RoomSuitabilityDialog
        room={suitabilityRoom}
        subjects={subjects}
        open={!!suitabilityRoom}
        onOpenChange={(o) => {
          if (!o) setSuitabilityRoom(null);
        }}
      />
    </>
  );
}
