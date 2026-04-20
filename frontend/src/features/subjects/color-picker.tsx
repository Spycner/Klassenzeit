import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
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

interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const initialHex = value.startsWith("#") ? value : "";
  const [hexInput, setHexInput] = useState(initialHex);

  function handleHexChange(raw: string) {
    setHexInput(raw);
    if (isValidColor(raw)) onChange(raw);
  }

  return (
    <div className="space-y-2">
      <fieldset className="grid grid-cols-6 gap-2 border-0 p-0 m-0">
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
        <span
          className="h-6 w-6 rounded-md border border-border/60"
          style={{ background: isValidColor(hexInput) ? hexInput : "transparent" }}
          aria-hidden="true"
        />
        <Input
          type="text"
          aria-label={t("subjects.customColor")}
          placeholder="#rrggbb"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          maxLength={7}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
