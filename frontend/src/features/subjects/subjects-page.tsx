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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Subject,
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from "./hooks";
import { SubjectFormSchema, type SubjectFormValues } from "./schema";

export function SubjectsPage() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Subject | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("subjects.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("subjects.new")}</Button>
      </div>

      {subjects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : subjects.isError ? (
        <p className="text-sm text-destructive">{t("subjects.loadError")}</p>
      ) : subjects.data && subjects.data.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("subjects.columns.name")}</TableHead>
                <TableHead>{t("subjects.columns.shortName")}</TableHead>
                <TableHead className="w-40 text-right">{t("subjects.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.data.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell className="font-medium">{subject.name}</TableCell>
                  <TableCell>{subject.short_name}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(subject)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(subject)}
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
        <p className="text-sm text-muted-foreground">{t("subjects.empty")}</p>
      )}

      <SubjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("subjects.dialog.createTitle")}
        description={t("subjects.dialog.createDescription")}
        submitLabel={t("common.create")}
      />

      {editing ? (
        <SubjectFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          title={t("subjects.dialog.editTitle")}
          description={t("subjects.dialog.editDescription", { name: editing.name })}
          submitLabel={t("common.save")}
          subject={editing}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteSubjectDialog subject={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

interface SubjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  subject?: Subject;
}

function SubjectFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  subject,
}: SubjectFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(SubjectFormSchema),
    defaultValues: {
      name: subject?.name ?? "",
      short_name: subject?.short_name ?? "",
    },
  });
  const createMutation = useCreateSubject();
  const updateMutation = useUpdateSubject();
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function onSubmit(values: SubjectFormValues) {
    if (subject) {
      await updateMutation.mutateAsync({ id: subject.id, body: values });
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
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("subjects.columns.name")}</FormLabel>
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
                  <FormLabel>{t("subjects.columns.shortName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
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

interface DeleteSubjectDialogProps {
  subject: Subject;
  onClose: () => void;
}

function DeleteSubjectDialog({ subject, onClose }: DeleteSubjectDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteSubject();
  async function confirm() {
    await mutation.mutateAsync(subject.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("subjects.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("subjects.dialog.deleteDescription", { name: subject.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
