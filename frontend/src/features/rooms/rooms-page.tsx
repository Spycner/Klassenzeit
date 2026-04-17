import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { type Room, useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from "./hooks";
import { RoomFormSchema, type RoomFormValues } from "./schema";

type SuitabilityMode = "general" | "specialized";

function suitabilityModeKey(mode: string): SuitabilityMode {
  return mode === "specialized" ? "specialized" : "general";
}

export function RoomsPage() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("rooms.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("rooms.new")}</Button>
      </div>

      {rooms.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rooms.isError ? (
        <p className="text-sm text-destructive">{t("rooms.loadError")}</p>
      ) : rooms.data && rooms.data.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rooms.columns.name")}</TableHead>
                <TableHead>{t("rooms.columns.shortName")}</TableHead>
                <TableHead>{t("rooms.columns.capacity")}</TableHead>
                <TableHead>{t("rooms.columns.mode")}</TableHead>
                <TableHead className="w-40 text-right">{t("rooms.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.data.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.short_name}</TableCell>
                  <TableCell>{room.capacity ?? "—"}</TableCell>
                  <TableCell>
                    {t(`rooms.suitabilityModes.${suitabilityModeKey(room.suitability_mode)}`)}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                      {t("common.edit")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(room)}>
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rooms.empty")}</p>
      )}

      <RoomFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("rooms.dialog.createTitle")}
        description={t("rooms.dialog.createDescription")}
        submitLabel={t("common.create")}
      />

      {editing ? (
        <RoomFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          title={t("rooms.dialog.editTitle")}
          description={t("rooms.dialog.editDescription", { name: editing.name })}
          submitLabel={t("common.save")}
          room={editing}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteRoomDialog room={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  room?: Room;
}

function RoomFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  room,
}: RoomFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<RoomFormValues>({
    resolver: zodResolver(RoomFormSchema),
    defaultValues: {
      name: room?.name ?? "",
      short_name: room?.short_name ?? "",
      capacity: room?.capacity ?? undefined,
      suitability_mode: room ? suitabilityModeKey(room.suitability_mode) : "general",
    },
  });
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handleRoomSubmit(values: RoomFormValues) {
    const capacity = typeof values.capacity === "number" ? values.capacity : null;
    const body = {
      name: values.name,
      short_name: values.short_name,
      capacity,
      suitability_mode: values.suitability_mode,
    };
    if (room) {
      await updateMutation.mutateAsync({ id: room.id, body });
    } else {
      await createMutation.mutateAsync(body);
    }
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleRoomSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="short_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.shortName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.capacity")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="suitability_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.mode")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">{t("rooms.suitabilityModes.general")}</SelectItem>
                      <SelectItem value="specialized">
                        {t("rooms.suitabilityModes.specialized")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("common.saving") : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteRoomDialogProps {
  room: Room;
  onClose: () => void;
}

function DeleteRoomDialog({ room, onClose }: DeleteRoomDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteRoom();
  async function confirmRoomDelete() {
    await mutation.mutateAsync(room.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rooms.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("rooms.dialog.deleteDescription", { name: room.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirmRoomDelete} disabled={mutation.isPending}>
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
