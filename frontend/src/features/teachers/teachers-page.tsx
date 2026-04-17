import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Teacher,
  useCreateTeacher,
  useDeleteTeacher,
  useTeachers,
  useUpdateTeacher,
} from "./hooks";
import { TeacherFormSchema, type TeacherFormValues } from "./schema";

export function TeachersPage() {
  const { t, i18n } = useTranslation();
  const teachers = useTeachers();
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Teacher | null>(null);

  const sorted = useMemo(() => {
    const list = teachers.data ?? [];
    return [...list].sort((a, b) => a.last_name.localeCompare(b.last_name, i18n.language));
  }, [teachers.data, i18n.language]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("teachers.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("teachers.new")}</Button>
      </div>

      {teachers.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : teachers.isError ? (
        <p className="text-sm text-destructive">{t("teachers.loadError")}</p>
      ) : sorted.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("teachers.columns.lastName")}</TableHead>
                <TableHead>{t("teachers.columns.firstName")}</TableHead>
                <TableHead>{t("teachers.columns.shortCode")}</TableHead>
                <TableHead>{t("teachers.columns.maxHoursPerWeek")}</TableHead>
                <TableHead className="w-40 text-right">{t("teachers.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-medium">{teacher.last_name}</TableCell>
                  <TableCell>{teacher.first_name}</TableCell>
                  <TableCell>{teacher.short_code}</TableCell>
                  <TableCell>{teacher.max_hours_per_week}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(teacher)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(teacher)}
                    >
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("teachers.empty")}</p>
      )}

      <TeacherFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("teachers.dialog.createTitle")}
        description={t("teachers.dialog.createDescription")}
        submitLabel={t("common.create")}
      />

      {editing ? (
        <TeacherFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          title={t("teachers.dialog.editTitle")}
          description={t("teachers.dialog.editDescription", {
            name: `${editing.first_name} ${editing.last_name}`,
          })}
          submitLabel={t("common.save")}
          teacher={editing}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteTeacherDialog teacher={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

interface TeacherFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  teacher?: Teacher;
}

function TeacherFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  teacher,
}: TeacherFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(TeacherFormSchema),
    defaultValues: {
      first_name: teacher?.first_name ?? "",
      last_name: teacher?.last_name ?? "",
      short_code: teacher?.short_code ?? "",
      max_hours_per_week: teacher?.max_hours_per_week ?? 1,
    },
  });
  const createMutation = useCreateTeacher();
  const updateMutation = useUpdateTeacher();
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handleTeacherSubmit(values: TeacherFormValues) {
    if (teacher) {
      await updateMutation.mutateAsync({ id: teacher.id, body: values });
    } else {
      await createMutation.mutateAsync(values);
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
          <form className="space-y-4" onSubmit={form.handleSubmit(handleTeacherSubmit)}>
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teachers.columns.firstName")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teachers.columns.lastName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="short_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teachers.columns.shortCode")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="max_hours_per_week"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teachers.columns.maxHoursPerWeek")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
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

interface DeleteTeacherDialogProps {
  teacher: Teacher;
  onClose: () => void;
}

function DeleteTeacherDialog({ teacher, onClose }: DeleteTeacherDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteTeacher();
  async function confirmTeacherDelete() {
    await mutation.mutateAsync(teacher.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("teachers.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("teachers.dialog.deleteDescription", {
              name: `${teacher.first_name} ${teacher.last_name}`,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirmTeacherDelete}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
