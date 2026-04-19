import { useSearch } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useState } from "react";
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
import { type Subject, useSubjects } from "./hooks";
import { DeleteSubjectDialog, SubjectFormDialog } from "./subjects-dialogs";

export function SubjectsPage() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Subject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Subject | null>(null);

  const rows = (subjects.data ?? []).filter((row) =>
    q ? `${row.name} ${row.short_name}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty = !subjects.isLoading && subjects.data && subjects.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <SubjectsPageHead
        title={t("subjects.title")}
        subtitle={t("subjects.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("subjects.new")}
      />

      {subjects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : subjects.isError ? (
        <p className="text-sm text-destructive">{t("subjects.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={t("subjects.empty.title")}
          body={t("subjects.empty.body")}
          steps={[t("subjects.empty.step1"), t("subjects.empty.step2"), t("subjects.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("subjects.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("subjects.title").toLowerCase()}
              </span>
            }
          />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("subjects.columns.name")}</TableHead>
                  <TableHead className="py-2">{t("subjects.columns.shortName")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("subjects.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="py-1.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="kz-swatch"
                          style={{ background: subjectColor(subject.id) }}
                        />
                        {subject.name}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-[12.5px]">
                      {subject.short_name}
                    </TableCell>
                    <TableCell className="space-x-2 py-1.5 text-right">
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
        </>
      )}

      <SubjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <SubjectFormDialog
          open={true}
          subject={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteSubjectDialog subject={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

function SubjectsPageHead({
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

function subjectColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const idx = (Math.abs(hash) % 5) + 1;
  return `var(--chart-${idx})`;
}
