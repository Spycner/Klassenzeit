import { useSearch } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Teacher, useTeachers } from "./hooks";
import { DeleteTeacherDialog, TeacherFormDialog } from "./teachers-dialogs";

export function TeachersPage() {
  const { t, i18n } = useTranslation();
  const teachers = useTeachers();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Teacher | null>(null);

  const sorted = useMemo(() => {
    const list = teachers.data ?? [];
    return [...list].sort((a, b) => a.last_name.localeCompare(b.last_name, i18n.language));
  }, [teachers.data, i18n.language]);

  const rows = sorted.filter((row) =>
    q
      ? `${row.first_name} ${row.last_name} ${row.short_code}`
          .toLowerCase()
          .includes(q.toLowerCase())
      : true,
  );
  const showEmpty = !teachers.isLoading && teachers.data && teachers.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <TeachersPageHead
        title={t("teachers.title")}
        subtitle={t("teachers.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("teachers.new")}
      />

      {teachers.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : teachers.isError ? (
        <p className="text-sm text-destructive">{t("teachers.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<GraduationCap className="h-7 w-7" />}
          title={t("teachers.empty.title")}
          body={t("teachers.empty.body")}
          steps={[t("teachers.empty.step1"), t("teachers.empty.step2"), t("teachers.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("teachers.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("teachers.title").toLowerCase()}
              </span>
            }
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("teachers.columns.lastName")}</TableHead>
                  <TableHead className="py-2">{t("teachers.columns.firstName")}</TableHead>
                  <TableHead className="py-2">{t("teachers.columns.shortCode")}</TableHead>
                  <TableHead className="py-2 text-right">
                    {t("teachers.columns.maxHoursPerWeek")}
                  </TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("teachers.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell className="py-1.5 font-medium">{teacher.last_name}</TableCell>
                    <TableCell className="py-1.5">{teacher.first_name}</TableCell>
                    <TableCell className="py-1.5 font-mono text-[12.5px]">
                      {teacher.short_code}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {teacher.max_hours_per_week}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap py-1.5 text-right">
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
        </>
      )}

      <TeacherFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <TeacherFormDialog
          open={true}
          teacher={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteTeacherDialog teacher={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

function TeachersPageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}
