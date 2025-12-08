import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { type SubjectSummary, useSubjects } from "@/api";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";

export function SubjectsListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: subjects,
    isLoading: subjectsLoading,
    error,
    refetch,
  } = useSubjects(schoolId);

  const isLoading = schoolLoading || subjectsLoading;
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  const columns: Column<SubjectSummary>[] = [
    {
      key: "name",
      header: t("subjects.columns.name"),
      sortable: true,
    },
    {
      key: "abbreviation",
      header: t("subjects.columns.abbreviation"),
      sortable: true,
    },
    {
      key: "color",
      header: t("subjects.columns.color"),
      cell: (row) =>
        row.color ? (
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: row.color }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {row.color}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const handleAddSubject = () => {
    navigate(`/${i18n.language}/subjects/new`);
  };

  const handleRowClick = (subject: SubjectSummary) => {
    navigate(`/${i18n.language}/subjects/${subject.id}`);
  };

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={t("subjects.title")}
          description={t("subjects.description")}
        />
        <ErrorState
          error={error ?? new Error(t("subjects.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("subjects.title")}
        description={t("subjects.description")}
        actions={
          <Button onClick={handleAddSubject}>{t("subjects.addSubject")}</Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !subjects || subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t("subjects.empty.title")}
          description={t("subjects.empty.description")}
          action={
            <Button onClick={handleAddSubject}>
              {t("subjects.addSubject")}
            </Button>
          }
        />
      ) : (
        <DataTable
          data={subjects}
          columns={columns}
          onRowClick={handleRowClick}
          keyField="id"
          defaultSort={{ key: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
