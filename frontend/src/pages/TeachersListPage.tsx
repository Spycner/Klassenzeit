import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { type TeacherSummary, useSchools, useTeachers } from "@/api";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";

export function TeachersListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  // MVP: Single school mode - use first available school
  const { data: schools, isLoading: schoolsLoading } = useSchools();
  const schoolId = schools?.[0]?.id;

  const {
    data: teachers,
    isLoading: teachersLoading,
    error,
    refetch,
  } = useTeachers(schoolId);

  const isLoading = schoolsLoading || teachersLoading;

  const columns: Column<TeacherSummary>[] = [
    {
      key: "name",
      header: t("teachers.columns.name"),
      cell: (row) => `${row.firstName} ${row.lastName}`,
      sortable: true,
    },
    {
      key: "abbreviation",
      header: t("teachers.columns.abbreviation"),
      sortable: true,
    },
  ];

  const handleAddTeacher = () => {
    navigate(`/${i18n.language}/teachers/new`);
  };

  const handleRowClick = (teacher: TeacherSummary) => {
    navigate(`/${i18n.language}/teachers/${teacher.id}`);
  };

  if (error) {
    return (
      <div>
        <PageHeader
          title={t("teachers.title")}
          description={t("teachers.description")}
        />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("teachers.title")}
        description={t("teachers.description")}
        actions={
          <Button onClick={handleAddTeacher}>{t("teachers.addTeacher")}</Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !teachers || teachers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("teachers.empty.title")}
          description={t("teachers.empty.description")}
          action={
            <Button onClick={handleAddTeacher}>
              {t("teachers.addTeacher")}
            </Button>
          }
        />
      ) : (
        <DataTable
          data={teachers}
          columns={columns}
          onRowClick={handleRowClick}
          keyField="id"
          defaultSort={{ key: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
