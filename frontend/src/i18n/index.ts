import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import deCommon from "./locales/de/common.json";
import deErrors from "./locales/de/errors.json";
import deNav from "./locales/de/nav.json";
import dePages from "./locales/de/pages.json";
import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enNav from "./locales/en/nav.json";
import enPages from "./locales/en/pages.json";

export const supportedLanguages = ["de", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "de";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      de: {
        common: deCommon,
        nav: deNav,
        pages: dePages,
        errors: deErrors,
      },
      en: {
        common: enCommon,
        nav: enNav,
        pages: enPages,
        errors: enErrors,
      },
    },
    fallbackLng: defaultLanguage,
    defaultNS: "common",
    ns: ["common", "nav", "pages", "errors"],
    detection: {
      order: ["path", "localStorage", "navigator"],
      lookupFromPathIndex: 0,
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
