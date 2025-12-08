import { DoorOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { type RoomSummary, useRooms } from "@/api";
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

export function RoomsListPage() {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();

  const { currentSchool, isLoading: schoolLoading } = useSchoolContext();
  const schoolId = currentSchool?.schoolId;

  const {
    data: rooms,
    isLoading: roomsLoading,
    error,
    refetch,
  } = useRooms(schoolId);

  const isLoading = schoolLoading || roomsLoading;
  const noSchoolAvailable = !schoolLoading && !currentSchool;

  const columns: Column<RoomSummary>[] = [
    {
      key: "name",
      header: t("rooms.columns.name"),
      sortable: true,
    },
    {
      key: "building",
      header: t("rooms.columns.building"),
      sortable: true,
      cell: (row) =>
        row.building ? (
          <span>{row.building}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "capacity",
      header: t("rooms.columns.capacity"),
      sortable: true,
      cell: (row) =>
        row.capacity ? (
          <span>{row.capacity}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "isActive",
      header: t("rooms.columns.status"),
      cell: (row) => (
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive ? t("common:active") : t("common:inactive")}
        </Badge>
      ),
    },
  ];

  const handleAddRoom = () => {
    navigate(`/${i18n.language}/rooms/new`);
  };

  const handleRowClick = (room: RoomSummary) => {
    navigate(`/${i18n.language}/rooms/${room.id}`);
  };

  if (error || noSchoolAvailable) {
    return (
      <div>
        <PageHeader
          title={t("rooms.title")}
          description={t("rooms.description")}
        />
        <ErrorState
          error={error ?? new Error(t("rooms.noSchoolAvailable"))}
          onRetry={noSchoolAvailable ? undefined : refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("rooms.title")}
        description={t("rooms.description")}
        actions={<Button onClick={handleAddRoom}>{t("rooms.addRoom")}</Button>}
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : !rooms || rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={t("rooms.empty.title")}
          description={t("rooms.empty.description")}
          action={<Button onClick={handleAddRoom}>{t("rooms.addRoom")}</Button>}
        />
      ) : (
        <DataTable
          data={rooms}
          columns={columns}
          onRowClick={handleRowClick}
          keyField="id"
          defaultSort={{ key: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
