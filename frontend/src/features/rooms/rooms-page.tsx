import { useSearch } from "@tanstack/react-router";
import { DoorOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Room, useRooms } from "./hooks";
import { DeleteRoomDialog, RoomFormDialog } from "./rooms-dialogs";

export function RoomsPage() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Room | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  const rows = (rooms.data ?? []).filter((row) =>
    q ? `${row.name} ${row.short_name}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty = !rooms.isLoading && rooms.data && rooms.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <RoomsPageHead
        title={t("rooms.title")}
        subtitle={t("rooms.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("rooms.new")}
      />

      {rooms.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rooms.isError ? (
        <p className="text-sm text-destructive">{t("rooms.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<DoorOpen className="h-7 w-7" />}
          title={t("rooms.empty.title")}
          body={t("rooms.empty.body")}
          steps={[t("rooms.empty.step1"), t("rooms.empty.step2"), t("rooms.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("rooms.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("rooms.title").toLowerCase()}
              </span>
            }
          />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("rooms.columns.name")}</TableHead>
                  <TableHead className="py-2">{t("rooms.columns.shortName")}</TableHead>
                  <TableHead className="py-2 text-right">{t("rooms.columns.capacity")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("rooms.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="py-1.5 font-medium">{room.name}</TableCell>
                    <TableCell className="py-1.5 font-mono text-[12.5px]">
                      {room.short_name}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {room.capacity ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(room)}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <RoomFormDialog open={creating} onOpenChange={setCreating} submitLabel={t("common.create")} />
      {editing ? (
        <RoomFormDialog
          open={true}
          room={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteRoomDialog room={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

function RoomsPageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}
