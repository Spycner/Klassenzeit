"use client";

import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = locale === "de" ? "en" : "de";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => router.replace(pathname, { locale: switchTo })}
      title={switchTo === "de" ? "Deutsch" : "English"}
    >
      {switchTo.toUpperCase()}
    </Button>
  );
}
