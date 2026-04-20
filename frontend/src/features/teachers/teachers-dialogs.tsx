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
import { type Teacher, useCreateTeacher, useDeleteTeacher, useUpdateTeacher } from "./hooks";
import { TeacherFormSchema, type TeacherFormValues } from "./schema";
import { TeacherQualificationsEditor } from "./teacher-qualifications-editor";

interface TeacherFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitLabel: string;
  teacher?: Teacher;
}

export function TeacherFormDialog({
  open,
  onOpenChange,
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

  const title = teacher ? t("teachers.dialog.editTitle") : t("teachers.dialog.createTitle");
  const description = teacher
    ? t("teachers.dialog.editDescription", {
        name: `${teacher.first_name} ${teacher.last_name}`,
      })
    : t("teachers.dialog.createDescription");

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
        {teacher ? <TeacherQualificationsEditor teacherId={teacher.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface DeleteTeacherDialogProps {
  teacher: Teacher;
  onClose: () => void;
}

export function DeleteTeacherDialog({ teacher, onClose }: DeleteTeacherDialogProps) {
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
