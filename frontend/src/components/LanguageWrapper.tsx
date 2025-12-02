import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useParams } from "react-router";

import {
  defaultLanguage,
  type SupportedLanguage,
  supportedLanguages,
} from "@/i18n";

export function LanguageWrapper() {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  const isValidLanguage = supportedLanguages.includes(
    lang as SupportedLanguage,
  );

  useEffect(() => {
    if (isValidLanguage && lang !== i18n.language) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n, isValidLanguage]);

  if (!isValidLanguage) {
    return <Navigate to={`/${defaultLanguage}`} replace />;
  }

  return <Outlet />;
}
