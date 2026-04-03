"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolResponse } from "@/lib/types";
import { ClassesTab } from "./components/classes-tab";
import { RoomsTab } from "./components/rooms-tab";
import { SubjectsTab } from "./components/subjects-tab";
import { TeachersTab } from "./components/teachers-tab";
import { TermsTab } from "./components/terms-tab";
import { TimeslotsTab } from "./components/timeslots-tab";

const TABS = [
  "terms",
  "classes",
  "subjects",
  "teachers",
  "rooms",
  "timeslots",
] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const apiClient = useApiClient();
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab =
    tabParam && TABS.includes(tabParam) ? tabParam : "terms";

  const setActiveTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    apiClient
      .get<SchoolResponse>(`/api/schools/${schoolId}`)
      .then(setSchool)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiClient, schoolId]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (school?.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "terms" && <TermsTab />}
        {activeTab === "classes" && <ClassesTab />}
        {activeTab === "subjects" && <SubjectsTab />}
        {activeTab === "teachers" && <TeachersTab />}
        {activeTab === "rooms" && <RoomsTab />}
        {activeTab === "timeslots" && <TimeslotsTab />}
      </div>
    </div>
  );
}
