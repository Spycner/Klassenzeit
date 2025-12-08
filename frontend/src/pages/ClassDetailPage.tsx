import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  useClass,
  useCreateClass,
  useDeleteClass,
  useUpdateClass,
} from "@/api";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { ClassForm, type ClassFormData } from "./classes/components";

export function ClassDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: schoolClass,
    isLoading: classLoading,
    error,
    refetch,
  } = useClass(schoolId, id);

  // Safe: mutations are only called when schoolId is defined (see handleSubmit guard)
  const createMutation = useCreateClass(schoolId!);
  const updateMutation = useUpdateClass(schoolId!);
  const deleteMutation = useDeleteClass(schoolId!);

  const isLoading = schoolLoading || (!isNew && classLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (data: ClassFormData) => {
    if (!schoolId) {
      return;
    }
    if (isNew) {
      await createMutation.mutateAsync({
        name: data.name,
        gradeLevel: data.gradeLevel,
        studentCount: data.studentCount,
        classTeacherId: data.classTeacherId,
      });
      toast.success(t("classes.created"));
      navigate(`/${i18n.language}/classes`);
    } else if (id) {
      await updateMutation.mutateAsync({
        id,
        data: {
          name: data.name,
          gradeLevel: data.gradeLevel,
          studentCount: data.studentCount,
          classTeacherId: data.classTeacherId,
          version: schoolClass?.version,
        },
      });
      toast.success(t("classes.updated"));
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteMutation.mutateAsync(id);
      toast.success(t("classes.deleted"));
      navigate(`/${i18n.language}/classes`);
    }
  };

  // Show error if no school selected
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("classes.newTitle") : t("classes.editTitle")}
          breadcrumbs={[
            { label: t("classes.title"), href: "/classes" },
            { label: isNew ? t("classes.newTitle") : t("classes.editTitle") },
          ]}
        />
        <ErrorState
          error={error ?? new Error(t("classes.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("classes.newTitle") : t("classes.editTitle")}
          breadcrumbs={[
            { label: t("classes.title"), href: "/classes" },
            { label: isNew ? t("classes.newTitle") : t("classes.editTitle") },
          ]}
        />
        <LoadingState />
      </div>
    );
  }

  const pageTitle = isNew ? t("classes.newTitle") : (schoolClass?.name ?? "");

  return (
    <div className="space-y-8">
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: t("classes.title"), href: "/classes" },
          { label: isNew ? t("classes.newTitle") : pageTitle },
        ]}
        actions={
          !isNew && (
            <Button
              variant="outline-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              {t("classes.delete")}
            </Button>
          )
        }
      />

      <ClassForm
        schoolClass={schoolClass}
        schoolId={schoolId!}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("classes.confirmDelete.title")}
        description={t("classes.confirmDelete.description")}
        confirmLabel={t("classes.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
