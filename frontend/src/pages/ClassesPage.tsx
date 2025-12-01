import { useTranslation } from "react-i18next";

export function ClassesPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("classes.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("classes.description")}</p>
    </div>
  );
}
