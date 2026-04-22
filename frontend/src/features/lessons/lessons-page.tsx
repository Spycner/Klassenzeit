import { useSearch } from "@tanstack/react-router";
import { Layers } from "lucide-react";
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
import { type Lesson, useLessons } from "./hooks";
import { DeleteLessonDialog, LessonFormDialog } from "./lessons-dialogs";

export function LessonsPage() {
  const { t } = useTranslation();
  const lessons = useLessons();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lesson | null>(null);

  const rows = (lessons.data ?? []).filter((row) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const teacherName = row.teacher
      ? `${row.teacher.first_name} ${row.teacher.last_name} ${row.teacher.short_code}`
      : "";
    return `${row.school_class.name} ${row.subject.name} ${row.subject.short_name} ${teacherName}`
      .toLowerCase()
      .includes(needle);
  });
  const showEmpty = !lessons.isLoading && lessons.data && lessons.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <LessonsPageHead
        title={t("lessons.title")}
        subtitle={t("lessons.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("lessons.new")}
      />

      {lessons.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : lessons.isError ? (
        <p className="text-sm text-destructive">{t("lessons.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<Layers className="h-7 w-7" />}
          title={t("lessons.empty.title")}
          body={t("lessons.empty.body")}
          steps={[t("lessons.empty.step1"), t("lessons.empty.step2"), t("lessons.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("lessons.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("lessons.title").toLowerCase()}
              </span>
            }
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("lessons.columns.schoolClass")}</TableHead>
                  <TableHead className="py-2">{t("lessons.columns.subject")}</TableHead>
                  <TableHead className="py-2">{t("lessons.columns.teacher")}</TableHead>
                  <TableHead className="py-2 text-right">
                    {t("lessons.columns.hoursPerWeek")}
                  </TableHead>
                  <TableHead className="py-2">{t("lessons.columns.blockSize")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("lessons.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((lesson) => (
                  <TableRow key={lesson.id}>
                    <TableCell className="py-1.5 font-medium">{lesson.school_class.name}</TableCell>
                    <TableCell className="py-1.5">
                      {lesson.subject.name}{" "}
                      <span className="text-muted-foreground">· {lesson.subject.short_name}</span>
                    </TableCell>
                    <TableCell
                      className="py-1.5 font-mono text-[12.5px]"
                      title={
                        lesson.teacher
                          ? `${lesson.teacher.first_name} ${lesson.teacher.last_name}`
                          : t("lessons.fields.teacherUnassigned")
                      }
                    >
                      {lesson.teacher ? lesson.teacher.short_code : "—"}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {lesson.hours_per_week}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {lesson.preferred_block_size === 2
                        ? t("lessons.fields.blockSizeDouble")
                        : t("lessons.fields.blockSizeSingle")}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(lesson)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(lesson)}
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

      <LessonFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <LessonFormDialog
          open={true}
          lesson={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteLessonDialog lesson={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

function LessonsPageHead({
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
