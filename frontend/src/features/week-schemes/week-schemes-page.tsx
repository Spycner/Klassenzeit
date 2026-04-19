import { useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWeekSchemes, type WeekScheme } from "./hooks";
import { DeleteWeekSchemeDialog, WeekSchemeFormDialog } from "./week-schemes-dialogs";

const DEFAULT_DAYS = 5;
const DEFAULT_PERIODS = 8;
const PERIOD_SLOTS = Array.from({ length: DEFAULT_PERIODS }, (_, i) => `P${i + 1}`);

export function WeekSchemesPage() {
  const { t, i18n } = useTranslation();
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
  const days = dayLabels(i18n.language);

  return (
    <div className="space-y-4">
      <WeekSchemesPageHead
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
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {DEFAULT_DAYS} × {DEFAULT_PERIODS}
                  </span>
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
                    <div
                      className="kz-ws-grid"
                      style={{ gridTemplateColumns: `80px repeat(${DEFAULT_DAYS}, 1fr)` }}
                    >
                      <div className="kz-ws-cell" data-variant="header" />
                      {days.map((day) => (
                        <div key={day} className="kz-ws-cell" data-variant="header">
                          {day}
                        </div>
                      ))}
                      {PERIOD_SLOTS.map((slot, period) => (
                        <WsRow key={slot} period={period} slot={slot} days={days} />
                      ))}
                    </div>
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

function WsRow({ period, slot, days }: { period: number; slot: string; days: string[] }) {
  return (
    <>
      <div className="kz-ws-cell" data-variant="time">
        {formatTime(period)}
      </div>
      {days.map((day) => (
        <div key={`${slot}-${day}`} className="kz-ws-cell" data-variant="period">
          {slot}
        </div>
      ))}
    </>
  );
}

function formatTime(period: number) {
  const hour = 8 + Math.floor(period * 0.75);
  const minute = period % 2 === 0 ? "00" : "45";
  return `${hour}:${minute}`;
}

function dayLabels(lang: string): string[] {
  if (lang.startsWith("de")) return ["Mo", "Di", "Mi", "Do", "Fr"];
  return ["Mo", "Tu", "We", "Th", "Fr"];
}

function WeekSchemesPageHead({
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
