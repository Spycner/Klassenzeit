import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isValidColor, resolveSubjectColor } from "./color";

const PALETTE: readonly string[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
  "chart-10",
  "chart-11",
  "chart-12",
];

const FALLBACK_HEX = "#000000";

function resolveHex(value: string): string {
  if (value.startsWith("#")) return value;
  if (typeof document === "undefined") return FALLBACK_HEX;
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(`--${value}`).trim();
  if (!cssValue) return FALLBACK_HEX;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return FALLBACK_HEX;
  ctx.fillStyle = cssValue;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(data[0] ?? 0)}${toHex(data[1] ?? 0)}${toHex(data[2] ?? 0)}`;
}

interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const displayHex = resolveHex(value);
  const [draft, setDraft] = useState(displayHex);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setDraft(displayHex);
    setSyncedValue(value);
  }

  const customSelected = value.startsWith("#");

  function handleDraftChange(raw: string) {
    setDraft(raw);
    if (isValidColor(raw)) onChange(raw);
  }

  function handlePickerChange(hex: string) {
    setDraft(hex);
    onChange(hex);
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-6 justify-items-center gap-2 border-0 p-0 m-0">
        <legend className="sr-only">{t("subjects.color")}</legend>
        {PALETTE.map((token) => {
          const selected = value === token;
          return (
            <button
              key={token}
              type="button"
              aria-label={token}
              aria-pressed={selected}
              onClick={() => onChange(token)}
              className={cn(
                "h-9 w-9 rounded-md border border-border/60 transition",
                selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
              style={{ background: resolveSubjectColor(token) }}
            />
          );
        })}
      </fieldset>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("subjects.pickColor")}
              className={cn(
                "h-6 w-6 shrink-0 cursor-pointer rounded-md border border-border/60",
                customSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
              style={{ background: isValidColor(displayHex) ? displayHex : FALLBACK_HEX }}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <HexColorPicker
              color={isValidColor(displayHex) ? displayHex : FALLBACK_HEX}
              onChange={handlePickerChange}
            />
          </PopoverContent>
        </Popover>
        <Input
          type="text"
          aria-label={t("subjects.customColor")}
          placeholder="#rrggbb"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          maxLength={7}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
