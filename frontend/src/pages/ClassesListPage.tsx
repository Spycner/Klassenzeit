import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { type SchoolClassSummary, useClasses } from "@/api";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";

export function ClassesListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: classes,
    isLoading: classesLoading,
    error,
    refetch,
  } = useClasses(schoolId);

  const isLoading = schoolLoading || classesLoading;
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  const columns: Column<SchoolClassSummary>[] = [
    {
      key: "name",
      header: t("classes.columns.name"),
      sortable: true,
    },
    {
      key: "gradeLevel",
      header: t("classes.columns.gradeLevel"),
      sortable: true,
    },
    {
      key: "studentCount",
      header: t("classes.columns.studentCount"),
      sortable: true,
      cell: (row) =>
        row.studentCount ? (
          row.studentCount
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "classTeacherName",
      header: t("classes.columns.classTeacher"),
      sortable: true,
      cell: (row) =>
        row.classTeacherName ? (
          row.classTeacherName
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "isActive",
      header: t("classes.columns.status"),
      cell: (row) => (
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive
            ? t("classes.status.active")
            : t("classes.status.inactive")}
        </Badge>
      ),
    },
  ];

  const handleAddClass = () => {
    navigate(`/${i18n.language}/classes/new`);
  };

  const handleRowClick = (schoolClass: SchoolClassSummary) => {
    navigate(`/${i18n.language}/classes/${schoolClass.id}`);
  };

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={t("classes.title")}
          description={t("classes.description")}
        />
        <ErrorState
          error={error ?? new Error(t("classes.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("classes.title")}
        description={t("classes.description")}
        actions={
          <Button onClick={handleAddClass}>{t("classes.addClass")}</Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !classes || classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("classes.empty.title")}
          description={t("classes.empty.description")}
          action={
            <Button onClick={handleAddClass}>{t("classes.addClass")}</Button>
          }
        />
      ) : (
        <DataTable
          data={classes}
          columns={columns}
          onRowClick={handleRowClick}
          keyField="id"
          defaultSort={{ key: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
