import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import {
  useCreateTeacher,
  useDeleteTeacher,
  useTeacher,
  useUpdateTeacher,
} from "@/api";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";
import {
  AvailabilitySection,
  QualificationsSection,
  TeacherForm,
  type TeacherFormData,
} from "./teachers/components";

export function TeacherDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: teacher,
    isLoading: teacherLoading,
    error,
    refetch,
  } = useTeacher(schoolId, id);

  // Safe: mutations are only called when schoolId is defined (see handleSubmit guard)
  const createMutation = useCreateTeacher(schoolId!);
  const updateMutation = useUpdateTeacher(schoolId!);
  const deleteMutation = useDeleteTeacher(schoolId!);

  const isLoading = schoolLoading || (!isNew && teacherLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (data: TeacherFormData) => {
    if (!schoolId) {
      // No school available - cannot create/update teacher
      return;
    }
    if (isNew) {
      const created = await createMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        abbreviation: data.abbreviation,
        maxHoursPerWeek: data.maxHoursPerWeek ?? undefined,
        isPartTime: data.isPartTime,
      });
      navigate(`/${i18n.language}/teachers/${created.id}`);
    } else if (id) {
      await updateMutation.mutateAsync({
        id,
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          abbreviation: data.abbreviation,
          maxHoursPerWeek: data.maxHoursPerWeek ?? undefined,
          isPartTime: data.isPartTime,
        },
      });
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteMutation.mutateAsync(id);
      navigate(`/${i18n.language}/teachers`);
    }
  };

  // Show error if no school selected
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("teachers.newTitle") : t("teachers.editTitle")}
          breadcrumbs={[
            { label: t("teachers.title"), href: "/teachers" },
            { label: isNew ? t("teachers.newTitle") : t("teachers.editTitle") },
          ]}
        />
        <ErrorState
          error={error ?? new Error(t("teachers.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("teachers.newTitle") : t("teachers.editTitle")}
          breadcrumbs={[
            { label: t("teachers.title"), href: "/teachers" },
            { label: isNew ? t("teachers.newTitle") : t("teachers.editTitle") },
          ]}
        />
        <LoadingState />
      </div>
    );
  }

  const pageTitle = isNew
    ? t("teachers.newTitle")
    : `${teacher?.firstName} ${teacher?.lastName}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: t("teachers.title"), href: "/teachers" },
          { label: isNew ? t("teachers.newTitle") : pageTitle },
        ]}
        actions={
          !isNew && (
            <Button
              variant="outline-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              {t("teachers.delete")}
            </Button>
          )
        }
      />

      <TeacherForm
        teacher={teacher}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {!isNew && id && schoolId && (
        <>
          <QualificationsSection schoolId={schoolId} teacherId={id} />
          <AvailabilitySection schoolId={schoolId} teacherId={id} />
        </>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("teachers.confirmDelete.title")}
        description={t("teachers.confirmDelete.description")}
        confirmLabel={t("teachers.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
