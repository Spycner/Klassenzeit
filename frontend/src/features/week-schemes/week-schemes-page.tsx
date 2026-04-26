import { useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { dayShortKey } from "@/i18n/day-keys";
import { cn } from "@/lib/utils";
import { type TimeBlock, useWeekSchemeDetail, useWeekSchemes, type WeekScheme } from "./hooks";
import { DeleteWeekSchemeDialog, WeekSchemeFormDialog } from "./week-schemes-dialogs";

export function WeekSchemesPage() {
  const { t } = useTranslation();
  const schemes = useWeekSchemes();
  const search = useSearch({ strict: false }) as { create?: string; id?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<WeekScheme | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WeekScheme | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(search.id);

  const rows = (schemes.data ?? []).filter((row) =>
    q ? `${row.name} ${row.description ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const active = rows.find((row) => row.id === activeId) ?? rows[0];
  const showEmpty = !schemes.isLoading && schemes.data && schemes.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("weekSchemes.title")}
        subtitle={t("weekSchemes.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("weekSchemes.new")}
      />

      {schemes.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : schemes.isError ? (
        <p className="text-sm text-destructive">{t("weekSchemes.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title={t("weekSchemes.empty.title")}
          body={t("weekSchemes.empty.body")}
          steps={[
            t("weekSchemes.empty.step1"),
            t("weekSchemes.empty.step2"),
            t("weekSchemes.empty.step3"),
          ]}
          onCreate={() => setCreating(true)}
          createLabel={t("weekSchemes.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("weekSchemes.title").toLowerCase()}
              </span>
            }
          />
          <div className="grid min-h-[520px] grid-cols-[300px_1fr] overflow-hidden rounded-xl border bg-card">
            <div className="overflow-y-auto border-r">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setActiveId(row.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-3.5 py-2.5 text-left hover:bg-accent",
                    active?.id === row.id && "bg-primary/10",
                  )}
                >
                  <span className="text-sm font-semibold">{row.name}</span>
                  {row.description ? (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {row.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="p-5">
              {active ? (
                <>
                  <h2 className="text-xl font-bold">{active.name}</h2>
                  {active.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
                  ) : null}
                  <div className="mt-4">
                    <WeekSchemeGrid schemeId={active.id} />
                  </div>
                  <div className="mt-5 flex gap-2">
                    <Button onClick={() => setEditing(active)}>{t("common.edit")}</Button>
                    <Button variant="destructive" onClick={() => setConfirmDelete(active)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      <WeekSchemeFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <WeekSchemeFormDialog
          open={true}
          scheme={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteWeekSchemeDialog scheme={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

function WeekSchemeGrid({ schemeId }: { schemeId: string }) {
  const { t } = useTranslation();
  const detail = useWeekSchemeDetail(schemeId);

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const blocks = detail.data?.time_blocks ?? [];
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("weekSchemes.detail.emptyBlocks")}</p>;
  }

  const daysPresent = Array.from(new Set(blocks.map((b) => b.day_of_week))).sort((a, b) => a - b);
  const positions = Array.from(new Set(blocks.map((b) => b.position))).sort((a, b) => a - b);
  const byKey = new Map<string, TimeBlock>();
  for (const block of blocks) {
    byKey.set(`${block.day_of_week}:${block.position}`, block);
  }

  return (
    <div
      className="kz-ws-grid"
      style={{ gridTemplateColumns: `56px repeat(${daysPresent.length}, 1fr)` }}
    >
      <div className="kz-ws-cell" data-variant="header" />
      {daysPresent.map((day) => (
        <div key={day} className="kz-ws-cell" data-variant="header">
          {t(dayShortKey(day))}
        </div>
      ))}
      {positions.map((position) => (
        <WeekSchemeGridRow
          key={position}
          position={position}
          daysPresent={daysPresent}
          byKey={byKey}
        />
      ))}
    </div>
  );
}

function WeekSchemeGridRow({
  position,
  daysPresent,
  byKey,
}: {
  position: number;
  daysPresent: number[];
  byKey: Map<string, TimeBlock>;
}) {
  return (
    <Fragment>
      <div className="kz-ws-cell" data-variant="time">
        P{position}
      </div>
      {daysPresent.map((day) => {
        const block = byKey.get(`${day}:${position}`);
        return (
          <div
            key={`${day}:${position}`}
            className="kz-ws-cell"
            {...(block ? { "data-variant": "period" } : {})}
          >
            {block ? (
              <div className="flex flex-col leading-tight">
                <span>{block.start_time.slice(0, 5)}</span>
                <span className="opacity-60">{block.end_time.slice(0, 5)}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </Fragment>
  );
}
