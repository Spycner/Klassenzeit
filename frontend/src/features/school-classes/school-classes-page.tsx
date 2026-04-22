import { useSearch } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
import { GenerateLessonsConfirmDialog } from "./generate-lessons-dialog";
import { type SchoolClass, useSchoolClasses } from "./hooks";
import { DeleteSchoolClassDialog, SchoolClassFormDialog } from "./school-classes-dialogs";

export function SchoolClassesPage() {
  const { t } = useTranslation();
  const schoolClasses = useSchoolClasses();
  const stundentafeln = useStundentafeln();
  const weekSchemes = useWeekSchemes();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SchoolClass | null>(null);
  const [generateFor, setGenerateFor] = useState<SchoolClass | null>(null);

  const stundentafelNameById = new Map(
    (stundentafeln.data ?? []).map((entry) => [entry.id, entry.name]),
  );
  const weekSchemeNameById = new Map(
    (weekSchemes.data ?? []).map((entry) => [entry.id, entry.name]),
  );

  const rows = (schoolClasses.data ?? []).filter((row) =>
    q ? `${row.name} ${row.grade_level}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty =
    !schoolClasses.isLoading && schoolClasses.data && schoolClasses.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <SchoolClassesPageHead
        title={t("schoolClasses.title")}
        subtitle={t("schoolClasses.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("schoolClasses.new")}
      />

      {schoolClasses.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : schoolClasses.isError ? (
        <p className="text-sm text-destructive">{t("schoolClasses.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={t("schoolClasses.empty.title")}
          body={t("schoolClasses.empty.body")}
          steps={[
            t("schoolClasses.empty.step1"),
            t("schoolClasses.empty.step2"),
            t("schoolClasses.empty.step3"),
          ]}
          onCreate={() => setCreating(true)}
          createLabel={t("schoolClasses.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("schoolClasses.title").toLowerCase()}
              </span>
            }
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("schoolClasses.columns.name")}</TableHead>
                  <TableHead className="py-2 text-right">
                    {t("schoolClasses.columns.gradeLevel")}
                  </TableHead>
                  <TableHead className="py-2">{t("schoolClasses.columns.stundentafel")}</TableHead>
                  <TableHead className="py-2">{t("schoolClasses.columns.weekScheme")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("schoolClasses.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((schoolClass) => (
                  <TableRow key={schoolClass.id}>
                    <TableCell className="py-1.5 font-medium">{schoolClass.name}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {schoolClass.grade_level}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {stundentafelNameById.get(schoolClass.stundentafel_id) ?? "—"}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {weekSchemeNameById.get(schoolClass.week_scheme_id) ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGenerateFor(schoolClass)}
                      >
                        {t("schoolClasses.generateLessons.action")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(schoolClass)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(schoolClass)}
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

      <SchoolClassFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <SchoolClassFormDialog
          open={true}
          schoolClass={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteSchoolClassDialog
          schoolClass={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
      {generateFor ? (
        <GenerateLessonsConfirmDialog
          schoolClass={generateFor}
          onDone={(count) => {
            setGenerateFor(null);
            if (count < 0) return;
            if (count === 0) {
              toast.info(t("schoolClasses.generateLessons.noneCreated"));
            } else {
              toast.success(t("schoolClasses.generateLessons.created", { count }));
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SchoolClassesPageHead({
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
