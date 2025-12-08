import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  useCreateSubject,
  useDeleteSubject,
  useSubject,
  useUpdateSubject,
} from "@/api";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { SubjectForm, type SubjectFormData } from "./subjects/components";

export function SubjectDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: subject,
    isLoading: subjectLoading,
    error,
    refetch,
  } = useSubject(schoolId, id);

  // Safe: mutations are only called when schoolId is defined (see handleSubmit guard)
  const createMutation = useCreateSubject(schoolId!);
  const updateMutation = useUpdateSubject(schoolId!);
  const deleteMutation = useDeleteSubject(schoolId!);

  const isLoading = schoolLoading || (!isNew && subjectLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (data: SubjectFormData) => {
    if (!schoolId) {
      return;
    }
    if (isNew) {
      await createMutation.mutateAsync({
        name: data.name,
        abbreviation: data.abbreviation,
        color: data.color ?? undefined,
      });
      toast.success(t("subjects.created"));
      navigate(`/${i18n.language}/subjects`);
    } else if (id) {
      await updateMutation.mutateAsync({
        id,
        data: {
          name: data.name,
          abbreviation: data.abbreviation,
          color: data.color ?? undefined,
        },
      });
      toast.success(t("subjects.updated"));
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteMutation.mutateAsync(id);
      toast.success(t("subjects.deleted"));
      navigate(`/${i18n.language}/subjects`);
    }
  };

  // Show error if no school selected
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("subjects.newTitle") : t("subjects.editTitle")}
          breadcrumbs={[
            { label: t("subjects.title"), href: "/subjects" },
            { label: isNew ? t("subjects.newTitle") : t("subjects.editTitle") },
          ]}
        />
        <ErrorState
          error={error ?? new Error(t("subjects.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("subjects.newTitle") : t("subjects.editTitle")}
          breadcrumbs={[
            { label: t("subjects.title"), href: "/subjects" },
            { label: isNew ? t("subjects.newTitle") : t("subjects.editTitle") },
          ]}
        />
        <LoadingState />
      </div>
    );
  }

  const pageTitle = isNew ? t("subjects.newTitle") : (subject?.name ?? "");

  return (
    <div className="space-y-8">
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: t("subjects.title"), href: "/subjects" },
          { label: isNew ? t("subjects.newTitle") : pageTitle },
        ]}
        actions={
          !isNew && (
            <Button
              variant="outline-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              {t("subjects.delete")}
            </Button>
          )
        }
      />

      <SubjectForm
        subject={subject}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("subjects.confirmDelete.title")}
        description={t("subjects.confirmDelete.description")}
        confirmLabel={t("subjects.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
