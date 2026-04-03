"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = locale === "de" ? "en" : "de";
  const segments = pathname.split("/");
  segments[1] = switchTo;
  const newPath = segments.join("/");

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => router.push(newPath)}
      title={switchTo === "de" ? "Deutsch" : "English"}
    >
      {switchTo.toUpperCase()}
    </Button>
  );
}
