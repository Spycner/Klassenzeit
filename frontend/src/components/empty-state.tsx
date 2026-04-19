import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  steps: [string, string, string];
  createLabel: string;
  onCreate: () => void;
}

export function EmptyState({ icon, title, body, steps, createLabel, onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-xl border border-dashed bg-card px-8 py-9 text-center">
      <div className="kz-empty-glyph">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-1">
        {steps.map((label, i) => (
          <div
            key={label}
            className="flex min-w-[180px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-[13px]"
          >
            <div className="kz-empty-step-num" data-state={i === 0 ? "done" : "todo"}>
              {i + 1}
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <Button onClick={onCreate} className="mt-1">
        <Plus className="mr-1 h-4 w-4" />
        {createLabel}
      </Button>
    </div>
  );
}
