import { useTranslation } from "react-i18next";

export function useLocalizedPath() {
  const { i18n } = useTranslation();

  const localizedPath = (path: string) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `/${i18n.language}/${cleanPath}`;
  };

  return { localizedPath, currentLanguage: i18n.language };
}
