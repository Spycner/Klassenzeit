import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function Home() {
  const { t, i18n } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{t("appName")}</h1>
      <p className="text-muted-foreground">{t("pages:home.tagline")}</p>
      <Button asChild>
        <Link to={`/${i18n.language}/dashboard`}>{t("getStarted")}</Link>
      </Button>
    </main>
  );
}
