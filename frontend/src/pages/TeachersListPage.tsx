import { RotateCcw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type TeacherSummary,
  usePermanentDeleteTeacher,
  useTeachers,
  useUpdateTeacher,
} from "@/api";
import {
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSchoolContext } from "@/contexts/SchoolContext";

export function TeachersListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;
  const isAdmin =
    currentSchool?.role === "SCHOOL_ADMIN" || currentSchool?.role === "PLANNER";

  const [showInactive, setShowInactive] = useState(false);
  const [teacherToReactivate, setTeacherToReactivate] =
    useState<TeacherSummary | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<TeacherSummary | null>(
    null,
  );

  const {
    data: teachers,
    isLoading: teachersLoading,
    error,
    refetch,
  } = useTeachers(schoolId, { includeInactive: showInactive });

  const updateMutation = useUpdateTeacher(schoolId ?? "");
  const permanentDeleteMutation = usePermanentDeleteTeacher(schoolId ?? "");

  const isLoading = schoolLoading || teachersLoading;

  const handleReactivate = async () => {
    if (teacherToReactivate && schoolId) {
      await updateMutation.mutateAsync({
        id: teacherToReactivate.id,
        data: { isActive: true },
      });
      setTeacherToReactivate(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (teacherToDelete && schoolId) {
      await permanentDeleteMutation.mutateAsync(teacherToDelete.id);
      setTeacherToDelete(null);
    }
  };

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
    ...(showInactive
      ? [
          {
            key: "status" as const,
            header: t("teachers.columns.status"),
            cell: (row: TeacherSummary) => (
              <Badge variant={row.isActive ? "outline" : "secondary"}>
                {row.isActive
                  ? t("teachers.status.active")
                  : t("teachers.status.inactive")}
              </Badge>
            ),
          },
          {
            key: "actions" as const,
            header: "",
            cell: (row: TeacherSummary) =>
              !row.isActive ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTeacherToReactivate(row);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title={t("teachers.reactivate")}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTeacherToDelete(row);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title={t("teachers.permanentDelete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null,
          },
        ]
      : []),
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

      {isAdmin && (
        <div className="mb-4 flex items-center space-x-2">
          <Checkbox
            id="showInactive"
            checked={showInactive}
            onCheckedChange={(checked) => setShowInactive(checked === true)}
          />
          <Label
            htmlFor="showInactive"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t("teachers.showInactive")}
          </Label>
        </div>
      )}

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

      <ConfirmDialog
        open={!!teacherToReactivate}
        onOpenChange={(open) => !open && setTeacherToReactivate(null)}
        title={t("teachers.confirmReactivate.title")}
        description={t("teachers.confirmReactivate.description")}
        confirmLabel={t("teachers.reactivate")}
        onConfirm={handleReactivate}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!teacherToDelete}
        onOpenChange={(open) => !open && setTeacherToDelete(null)}
        title={t("teachers.confirmPermanentDelete.title")}
        description={t("teachers.confirmPermanentDelete.description")}
        confirmLabel={t("teachers.permanentDelete")}
        variant="destructive"
        onConfirm={handlePermanentDelete}
        isLoading={permanentDeleteMutation.isPending}
      />
    </div>
  );
}
