import { Palette } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#6B7280", // gray
  "#1E293B", // slate
];

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  placeholder?: string;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  placeholder = "#3B82F6",
  className,
}: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [hexInput, setHexInput] = React.useState(value || "");

  React.useEffect(() => {
    setHexInput(value || "");
  }, [value]);

  const handlePresetClick = (color: string) => {
    onChange(color);
    setHexInput(color);
  };

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    onChange(color);
    setHexInput(color);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setHexInput(input);

    // Only update if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(input)) {
      onChange(input);
    }
  };

  const handleHexInputBlur = () => {
    // If input is invalid, reset to current value
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      setHexInput(value || "");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start gap-2 font-normal", className)}
        >
          {value ? (
            <>
              <div
                className="h-4 w-4 rounded border"
                style={{ backgroundColor: value }}
              />
              <span>{value}</span>
            </>
          ) : (
            <>
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{placeholder}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Presets</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded border-2 transition-all hover:scale-110",
                    value === color
                      ? "border-primary ring-2 ring-primary ring-offset-2"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => handlePresetClick(color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Custom</Label>
            <div className="flex gap-2">
              <div className="relative h-9 w-9 overflow-hidden rounded-md border border-input">
                <input
                  type="color"
                  value={value || "#3B82F6"}
                  onChange={handleColorPickerChange}
                  className="absolute -inset-1 h-12 w-12 cursor-pointer border-0 p-0"
                />
              </div>
              <Input
                value={hexInput}
                onChange={handleHexInputChange}
                onBlur={handleHexInputBlur}
                placeholder="#3B82F6"
                className="flex-1 font-mono text-sm uppercase"
                maxLength={7}
              />
            </div>
          </div>

          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setHexInput("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
