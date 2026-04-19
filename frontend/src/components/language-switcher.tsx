import { useTranslation } from "react-i18next";
import { type Locale, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language.split("-")[0] as Locale) ?? locales[0];

  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5">
      {locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => {
              if (!active) void i18n.changeLanguage(loc);
            }}
            aria-pressed={active}
            className={cn(
              "rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold uppercase",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
