import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWeekSchemeDetail, useWeekSchemes } from "@/features/week-schemes/hooks";
import { dayLongKey, dayShortKey } from "@/i18n/day-keys";
import { cn } from "@/lib/utils";
import { type RoomDetail, useRoomDetail, useSaveRoomAvailability } from "./hooks";

export function RoomAvailabilityGrid({ roomId }: { roomId: string }) {
  const detail = useRoomDetail(roomId);
  if (!detail.isSuccess) return null;
  return <RoomAvailabilityGridLoaded room={detail.data} />;
}

function RoomAvailabilityGridLoaded({ room }: { room: RoomDetail }) {
  const { t } = useTranslation();
  const schemes = useWeekSchemes();
  const save = useSaveRoomAvailability();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(room.availability.map((a) => a.time_block_id)),
  );

  function toggleRoomAvailabilityCell(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRoomAvailabilitySave() {
    await save.mutateAsync({ id: room.id, timeBlockIds: Array.from(selected) });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("rooms.availability.sectionTitle")}</h3>
      </div>
      {schemes.data && schemes.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rooms.availability.noSchemes")}</p>
      ) : (
        (schemes.data ?? []).map((scheme) => (
          <RoomAvailabilitySchemeSection
            key={scheme.id}
            schemeId={scheme.id}
            schemeName={scheme.name}
            selected={selected}
            onToggle={toggleRoomAvailabilityCell}
          />
        ))
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleRoomAvailabilitySave} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("rooms.availability.save")}
        </Button>
      </div>
    </div>
  );
}

function RoomAvailabilitySchemeSection({
  schemeId,
  schemeName,
  selected,
  onToggle,
}: {
  schemeId: string;
  schemeName: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const detail = useWeekSchemeDetail(schemeId);
  const blocks = detail.data?.time_blocks ?? [];
  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (blocks.length === 0) {
    return (
      <section>
        <h4 className="text-sm font-medium">{schemeName}</h4>
        <p className="text-sm text-muted-foreground">{t("rooms.availability.noBlocks")}</p>
      </section>
    );
  }
  const days = [0, 1, 2, 3, 4] as const;
  const positions = Array.from(new Set(blocks.map((b) => b.position))).sort((a, b) => a - b);
  const byKey = new Map(blocks.map((b) => [`${b.day_of_week}-${b.position}`, b]));
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-medium">{schemeName}</h4>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="w-16 p-1 text-left font-medium">{t("common.position")}</th>
            {days.map((d) => (
              <th key={d} className="p-1 text-left font-medium">
                {t(dayShortKey(d))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p}>
              <td className="p-1 font-mono">{p}</td>
              {days.map((d) => {
                const block = byKey.get(`${d}-${p}`);
                if (!block) return <td key={d} className="p-1" aria-hidden="true" />;
                const isOn = selected.has(block.id);
                const dayName = t(dayLongKey(d));
                return (
                  <td key={d} className="p-1">
                    <button
                      type="button"
                      aria-pressed={isOn}
                      aria-label={
                        isOn
                          ? t("rooms.availability.cellAvailable", {
                              day: dayName,
                              position: p,
                            })
                          : t("rooms.availability.cellUnavailable", {
                              day: dayName,
                              position: p,
                            })
                      }
                      onClick={() => onToggle(block.id)}
                      className={cn(
                        "flex h-7 w-full items-center justify-center rounded border text-xs",
                        isOn
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {isOn ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
