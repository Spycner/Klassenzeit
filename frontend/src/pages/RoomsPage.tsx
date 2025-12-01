import { useTranslation } from "react-i18next";

export function RoomsPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("rooms.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("rooms.description")}</p>
    </div>
  );
}
