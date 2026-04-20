import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { resolveSubjectColor } from "@/features/subjects/color";
import { useSubjects } from "@/features/subjects/hooks";
import { cn } from "@/lib/utils";

interface SubjectMultiPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function SubjectMultiPicker({ value, onChange }: SubjectMultiPickerProps) {
  const { t } = useTranslation();
  const subjectsQuery = useSubjects();
  const [query, setQuery] = useState("");

  const subjects = subjectsQuery.data ?? [];
  const selectedSet = new Set(value);
  const selected = subjects.filter((s) => selectedSet.has(s.id));
  const unselected = subjects
    .filter((s) => !selectedSet.has(s.id))
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.short_name.toLowerCase().includes(q);
    });

  function addSubject(id: string) {
    onChange([...value, id]);
  }
  function removeSubject(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex min-h-10 flex-wrap gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2",
          selected.length === 0 && "items-center",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("rooms.suitableSubjectsEmpty")}</span>
        ) : (
          selected.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={`remove ${s.name}`}
              onClick={() => removeSubject(s.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-background px-2 py-0.5 text-xs shadow-sm transition hover:bg-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: resolveSubjectColor(s.color) }}
                aria-hidden="true"
              />
              {s.name}
              <span aria-hidden="true" className="text-muted-foreground">
                ×
              </span>
            </button>
          ))
        )}
      </div>
      <Input
        type="search"
        placeholder={t("common.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
        {unselected.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">{t("common.noResults")}</div>
        ) : (
          unselected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addSubject(s.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: resolveSubjectColor(s.color) }}
                aria-hidden="true"
              />
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {s.short_name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
