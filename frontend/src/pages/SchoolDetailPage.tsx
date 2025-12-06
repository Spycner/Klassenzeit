import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import {
  useCreateSchool,
  useDeleteSchool,
  useSchool,
  useUpdateSchool,
} from "@/api";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolAccess } from "@/hooks";

import {
  MembersSection,
  SchoolForm,
  type SchoolFormData,
  SchoolSettingsSection,
} from "./schools/components";

export function SchoolDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    canCreateSchool,
    canEditSchool,
    canDeleteSchool,
    canManageMembers,
    isLoading: accessLoading,
  } = useSchoolAccess(id);

  const {
    data: school,
    isLoading: schoolLoading,
    error,
    refetch,
  } = useSchool(id);

  const createMutation = useCreateSchool();
  const updateMutation = useUpdateSchool();
  const deleteMutation = useDeleteSchool();

  const isLoading = accessLoading || (!isNew && schoolLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Check permissions
  const canEdit = isNew ? canCreateSchool : canEditSchool(id);
  const canDelete = !isNew && canDeleteSchool(id);
  const canViewMembers = !isNew && canManageMembers(id);

  const handleSubmit = async (data: SchoolFormData) => {
    if (isNew) {
      if (!canCreateSchool) return;
      const created = await createMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        schoolType: data.schoolType,
        minGrade: data.minGrade,
        maxGrade: data.maxGrade,
        timezone: data.timezone,
        settings: data.settings,
      });
      navigate(`/${i18n.language}/schools/${created.id}`);
    } else if (id) {
      if (!canEditSchool(id)) return;
      await updateMutation.mutateAsync({
        id,
        data: {
          name: data.name,
          slug: data.slug,
          schoolType: data.schoolType,
          minGrade: data.minGrade,
          maxGrade: data.maxGrade,
          timezone: data.timezone,
          settings: data.settings,
        },
      });
    }
  };

  const handleDelete = async () => {
    if (id && canDelete) {
      await deleteMutation.mutateAsync(id);
      navigate(`/${i18n.language}/schools`);
    }
  };

  // Permission denied for new school creation
  if (isNew && !accessLoading && !canCreateSchool) {
    return (
      <div>
        <PageHeader
          title={t("schools.newTitle")}
          breadcrumbs={[
            { label: t("schools.title"), href: "/schools" },
            { label: t("schools.newTitle") },
          ]}
        />
        <ErrorState error={new Error(t("schools.permissionDenied"))} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("schools.newTitle") : t("schools.editTitle")}
          breadcrumbs={[
            { label: t("schools.title"), href: "/schools" },
            { label: isNew ? t("schools.newTitle") : t("schools.editTitle") },
          ]}
        />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("schools.newTitle") : t("schools.editTitle")}
          breadcrumbs={[
            { label: t("schools.title"), href: "/schools" },
            { label: isNew ? t("schools.newTitle") : t("schools.editTitle") },
          ]}
        />
        <LoadingState />
      </div>
    );
  }

  const pageTitle = isNew ? t("schools.newTitle") : (school?.name ?? "");

  return (
    <div className="space-y-8">
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: t("schools.title"), href: "/schools" },
          { label: isNew ? t("schools.newTitle") : pageTitle },
        ]}
        actions={
          canDelete && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              {t("schools.delete")}
            </Button>
          )
        }
      />

      <SchoolForm
        school={school}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        disabled={!canEdit}
      />

      {canViewMembers && id && <MembersSection schoolId={id} />}

      {!isNew && id && school && (
        <SchoolSettingsSection school={school} disabled={!canEdit} />
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("schools.confirmDelete.title")}
        description={t("schools.confirmDelete.description")}
        confirmLabel={t("schools.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
