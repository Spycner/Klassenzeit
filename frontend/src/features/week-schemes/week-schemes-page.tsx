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
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateWeekScheme,
  useDeleteWeekScheme,
  useUpdateWeekScheme,
  useWeekSchemes,
  type WeekScheme,
} from "./hooks";
import { WeekSchemeFormSchema, type WeekSchemeFormValues } from "./schema";

const DESCRIPTION_PREVIEW_LIMIT = 80;

function truncateDescription(description: string | null | undefined): string {
  if (!description) return "";
  return description.length > DESCRIPTION_PREVIEW_LIMIT
    ? `${description.slice(0, DESCRIPTION_PREVIEW_LIMIT)}…`
    : description;
}

export function WeekSchemesPage() {
  const { t } = useTranslation();
  const schemes = useWeekSchemes();
  const [editing, setEditing] = useState<WeekScheme | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WeekScheme | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("weekSchemes.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("weekSchemes.new")}</Button>
      </div>

      {schemes.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : schemes.isError ? (
        <p className="text-sm text-destructive">{t("weekSchemes.loadError")}</p>
      ) : schemes.data && schemes.data.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weekSchemes.columns.name")}</TableHead>
                <TableHead>{t("weekSchemes.columns.description")}</TableHead>
                <TableHead className="w-40 text-right">
                  {t("weekSchemes.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemes.data.map((scheme) => (
                <TableRow key={scheme.id}>
                  <TableCell className="font-medium">{scheme.name}</TableCell>
                  <TableCell>{truncateDescription(scheme.description)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(scheme)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(scheme)}
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
        <p className="text-sm text-muted-foreground">{t("weekSchemes.empty")}</p>
      )}

      <WeekSchemeFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("weekSchemes.dialog.createTitle")}
        description={t("weekSchemes.dialog.createDescription")}
        submitLabel={t("common.create")}
      />

      {editing ? (
        <WeekSchemeFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          title={t("weekSchemes.dialog.editTitle")}
          description={t("weekSchemes.dialog.editDescription", { name: editing.name })}
          submitLabel={t("common.save")}
          scheme={editing}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteWeekSchemeDialog scheme={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

interface WeekSchemeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  scheme?: WeekScheme;
}

function WeekSchemeFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  scheme,
}: WeekSchemeFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<WeekSchemeFormValues>({
    resolver: zodResolver(WeekSchemeFormSchema),
    defaultValues: {
      name: scheme?.name ?? "",
      description: scheme?.description ?? "",
    },
  });
  const createMutation = useCreateWeekScheme();
  const updateMutation = useUpdateWeekScheme();
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handleWeekSchemeSubmit(values: WeekSchemeFormValues) {
    const body = {
      name: values.name,
      description: values.description ? values.description : null,
    };
    if (scheme) {
      await updateMutation.mutateAsync({ id: scheme.id, body });
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
          <form className="space-y-4" onSubmit={form.handleSubmit(handleWeekSchemeSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("weekSchemes.columns.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("weekSchemes.columns.description")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ""} />
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

interface DeleteWeekSchemeDialogProps {
  scheme: WeekScheme;
  onClose: () => void;
}

function DeleteWeekSchemeDialog({ scheme, onClose }: DeleteWeekSchemeDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteWeekScheme();
  async function confirmWeekSchemeDelete() {
    await mutation.mutateAsync(scheme.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("weekSchemes.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("weekSchemes.dialog.deleteDescription", { name: scheme.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirmWeekSchemeDelete}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
