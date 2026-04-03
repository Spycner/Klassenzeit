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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { SubjectResponse } from "@/lib/types";

export function SubjectsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.subjects");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<SubjectResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubjectResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [color, setColor] = useState("");
  const [needsSpecialRoom, setNeedsSpecialRoom] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SubjectResponse | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setAbbreviation("");
    setColor("");
    setNeedsSpecialRoom(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: SubjectResponse) {
    setEditingItem(item);
    setName(item.name);
    setAbbreviation(item.abbreviation);
    setColor(item.color ?? "");
    setNeedsSpecialRoom(item.needs_special_room);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !abbreviation.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        abbreviation: abbreviation.trim(),
        color: color.trim() || null,
        needs_special_room: needsSpecialRoom,
      };
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/subjects/${editingItem.id}`,
          body,
        );
      } else {
        await apiClient.post(`/api/schools/${schoolId}/subjects`, body);
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
        `/api/schools/${schoolId}/subjects/${itemToDelete.id}`,
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("abbreviation")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("color")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.abbreviation}</TableCell>
              <TableCell>
                {item.name}
                {item.needs_special_room && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {t("specialRoomBadge")}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {item.color ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {item.color}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">{"\u2014"}</span>
                )}
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
                colSpan={4}
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
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("abbreviation")}</Label>
                <Input
                  placeholder={t("abbreviationPlaceholder")}
                  value={abbreviation}
                  onChange={(e) => setAbbreviation(e.target.value)}
                  maxLength={10}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("color")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={color || "#000000"}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={saving}
                    className="h-9 w-12 p-1"
                  />
                  <Input
                    placeholder="#FF0000"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={saving}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="needs-special-room"
                checked={needsSpecialRoom}
                onChange={(e) => setNeedsSpecialRoom(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="needs-special-room">
                {t("needsSpecialRoom")}
              </Label>
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
              disabled={!name.trim() || !abbreviation.trim() || saving}
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
