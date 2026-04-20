import { zodResolver } from "@hookform/resolvers/zod";
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
import { type Room, useCreateRoom, useDeleteRoom, useUpdateRoom } from "./hooks";
import { RoomFormSchema, type RoomFormValues } from "./schema";

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitLabel: string;
  room?: Room;
}

export function RoomFormDialog({ open, onOpenChange, submitLabel, room }: RoomFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<RoomFormValues>({
    resolver: zodResolver(RoomFormSchema),
    defaultValues: {
      name: room?.name ?? "",
      short_name: room?.short_name ?? "",
      capacity: room?.capacity ?? undefined,
    },
  });
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const title = room ? t("rooms.dialog.editTitle") : t("rooms.dialog.createTitle");
  const description = room
    ? t("rooms.dialog.editDescription", { name: room.name })
    : t("rooms.dialog.createDescription");

  async function handleRoomSubmit(values: RoomFormValues) {
    const capacity = typeof values.capacity === "number" ? values.capacity : null;
    const body = {
      name: values.name,
      short_name: values.short_name,
      capacity,
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

export function DeleteRoomDialog({ room, onClose }: DeleteRoomDialogProps) {
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
