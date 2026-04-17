import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { type Locale, locales } from "@/i18n/config";

function otherLocale(current: string): Locale {
  const currentBase = current.split("-")[0] as Locale;
  return locales.find((l) => l !== currentBase) ?? locales[0];
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const next = otherLocale(i18n.language);
  const code = next.toUpperCase();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("language.switchTo", { locale: code })}
      onClick={() => {
        void i18n.changeLanguage(next);
      }}
    >
      <span className="text-xs font-semibold">{code}</span>
    </Button>
  );
}
