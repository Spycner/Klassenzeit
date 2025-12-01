import { useTranslation } from "react-i18next";

export function TimetablePage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("timetable.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("timetable.description")}</p>
    </div>
  );
}
