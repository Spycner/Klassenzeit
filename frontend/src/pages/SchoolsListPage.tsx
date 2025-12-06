import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { type SchoolSummary, useSchools } from "@/api";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolAccess } from "@/hooks";

export function SchoolsListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();
  const { canCreateSchool, isLoading: accessLoading } = useSchoolAccess();

  const {
    data: schools,
    isLoading: schoolsLoading,
    error,
    refetch,
  } = useSchools();

  const isLoading = schoolsLoading || accessLoading;

  const columns: Column<SchoolSummary>[] = [
    {
      key: "name",
      header: t("schools.columns.name"),
      sortable: true,
    },
    {
      key: "slug",
      header: t("schools.columns.slug"),
      sortable: true,
    },
    {
      key: "schoolType",
      header: t("schools.columns.schoolType"),
      sortable: true,
    },
  ];

  const handleAddSchool = () => {
    navigate(`/${i18n.language}/schools/new`);
  };

  const handleRowClick = (school: SchoolSummary) => {
    navigate(`/${i18n.language}/schools/${school.id}`);
  };

  if (error) {
    return (
      <div>
        <PageHeader
          title={t("schools.title")}
          description={t("schools.description")}
        />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("schools.title")}
        description={t("schools.description")}
        actions={
          canCreateSchool && (
            <Button onClick={handleAddSchool}>{t("schools.addSchool")}</Button>
          )
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !schools || schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("schools.empty.title")}
          description={t("schools.empty.description")}
          action={
            canCreateSchool && (
              <Button onClick={handleAddSchool}>
                {t("schools.addSchool")}
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          data={schools}
          columns={columns}
          onRowClick={handleRowClick}
          keyField="id"
          defaultSort={{ key: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
