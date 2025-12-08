import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import {
  useCreateSchool,
  useCurrentUser,
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
import { useSchoolContext } from "@/contexts/SchoolContext";
import { useSchoolAccess } from "@/hooks";

import {
  MembersSection,
  SchoolForm,
  type SchoolFormData,
  SchoolSettingsSection,
} from "./schools/components";

export function SchoolDetailPage() {
  const { slug } = useParams();
  const isNew = !slug;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use slug to fetch school (the hook handles redirects if slug changed)
  const {
    data: school,
    isLoading: schoolLoading,
    error,
    refetch,
  } = useSchool(slug);

  // Use school.id for permission checks (once we have the school)
  const schoolId = school?.id;
  const {
    canCreateSchool,
    canEditSchool,
    canDeleteSchool,
    canManageMembers,
    isLoading: accessLoading,
  } = useSchoolAccess(schoolId);

  const { setCurrentSchool } = useSchoolContext();
  const { data: currentUser } = useCurrentUser();

  const createMutation = useCreateSchool();
  const updateMutation = useUpdateSchool();
  const deleteMutation = useDeleteSchool();

  const isLoading = accessLoading || (!isNew && schoolLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Check permissions
  const canEdit = isNew ? canCreateSchool : canEditSchool(schoolId);
  const canDelete = !isNew && schoolId && canDeleteSchool(schoolId);
  const canViewMembers = !isNew && schoolId && canManageMembers(schoolId);

  const handleSubmit = async (data: SchoolFormData) => {
    if (isNew) {
      if (!canCreateSchool) return;
      // Type guard: createSchoolSchema includes initialAdminUserId
      if (!("initialAdminUserId" in data)) return;
      const created = await createMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        schoolType: data.schoolType,
        minGrade: data.minGrade,
        maxGrade: data.maxGrade,
        timezone: data.timezone,
        settings: data.settings,
        initialAdminUserId: data.initialAdminUserId,
      });
      // Auto-select the new school if current user is the initial admin
      if (currentUser?.id === data.initialAdminUserId) {
        setCurrentSchool({
          schoolId: created.id,
          schoolName: created.name,
          role: "SCHOOL_ADMIN",
        });
      }
      toast.success(t("schools.created"));
      // Navigate to the new school's slug
      navigate(`/${i18n.language}/schools/${created.slug}`);
    } else if (schoolId) {
      if (!canEditSchool(schoolId)) return;
      await updateMutation.mutateAsync({
        id: schoolId,
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
      toast.success(t("schools.updated"));
      // If slug changed, navigate to new URL
      if (data.slug !== slug) {
        navigate(`/${i18n.language}/schools/${data.slug}`, { replace: true });
      }
    }
  };

  const handleDelete = async () => {
    if (schoolId && canDelete) {
      await deleteMutation.mutateAsync({ id: schoolId, slug });
      toast.success(t("schools.deleted"));
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

      {canViewMembers && schoolId && <MembersSection schoolId={schoolId} />}

      {!isNew && schoolId && school && (
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
