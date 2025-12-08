import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useCreateRoom, useDeleteRoom, useRoom, useUpdateRoom } from "@/api";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useSchoolContext } from "@/contexts/SchoolContext";
import {
  RoomForm,
  type RoomFormData,
  SubjectSuitabilitySection,
} from "./rooms/components";

export function RoomDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: room,
    isLoading: roomLoading,
    error,
    refetch,
  } = useRoom(schoolId, id);

  // Safe: mutations are only called when schoolId is defined (see handleSubmit guard)
  const createMutation = useCreateRoom(schoolId!);
  const updateMutation = useUpdateRoom(schoolId!);
  const deleteMutation = useDeleteRoom(schoolId!);

  const isLoading = schoolLoading || (!isNew && roomLoading);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (data: RoomFormData) => {
    if (!schoolId) {
      return;
    }
    if (isNew) {
      const newRoom = await createMutation.mutateAsync({
        name: data.name,
        building: data.building ?? undefined,
        capacity: data.capacity ?? undefined,
      });
      toast.success(t("rooms.created"));
      // Navigate to edit page to allow adding subject suitabilities
      navigate(`/${i18n.language}/rooms/${newRoom.id}`, { replace: true });
    } else if (id) {
      await updateMutation.mutateAsync({
        id,
        data: {
          name: data.name,
          building: data.building ?? undefined,
          capacity: data.capacity ?? undefined,
        },
      });
      toast.success(t("rooms.updated"));
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteMutation.mutateAsync(id);
      toast.success(t("rooms.deleted"));
      navigate(`/${i18n.language}/rooms`);
    }
  };

  // Show error if no school selected
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("rooms.newTitle") : t("rooms.editTitle")}
          breadcrumbs={[
            { label: t("rooms.title"), href: "/rooms" },
            { label: isNew ? t("rooms.newTitle") : t("rooms.editTitle") },
          ]}
        />
        <ErrorState
          error={error ?? new Error(t("rooms.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={isNew ? t("rooms.newTitle") : t("rooms.editTitle")}
          breadcrumbs={[
            { label: t("rooms.title"), href: "/rooms" },
            { label: isNew ? t("rooms.newTitle") : t("rooms.editTitle") },
          ]}
        />
        <LoadingState />
      </div>
    );
  }

  const pageTitle = isNew ? t("rooms.newTitle") : (room?.name ?? "");

  return (
    <div className="space-y-8">
      <PageHeader
        title={pageTitle}
        breadcrumbs={[
          { label: t("rooms.title"), href: "/rooms" },
          { label: isNew ? t("rooms.newTitle") : pageTitle },
        ]}
        actions={
          !isNew && (
            <Button
              variant="outline-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              {t("rooms.delete")}
            </Button>
          )
        }
      />

      <RoomForm
        room={room}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Subject suitability section - only show when editing an existing room */}
      {!isNew && id && schoolId && (
        <SubjectSuitabilitySection schoolId={schoolId} roomId={id} />
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("rooms.confirmDelete.title")}
        description={t("rooms.confirmDelete.description")}
        confirmLabel={t("rooms.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
