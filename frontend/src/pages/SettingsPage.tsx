import { useTranslation } from "react-i18next";

export function SettingsPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("settings.description")}</p>
    </div>
  );
}
