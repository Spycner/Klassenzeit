"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function MobileHeader() {
  const pathname = usePathname();
  const tSchool = useTranslations("school");
  const tCurriculum = useTranslations("curriculum");
  const tScheduler = useTranslations("scheduler");
  const tTimetable = useTranslations("timetable");
  const tSettings = useTranslations("settings");

  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  let title = "";
  switch (last) {
    case "members":
      title = tSchool("members");
      break;
    case "curriculum":
      title = tCurriculum("title");
      break;
    case "schedule":
      title = tScheduler("title");
      break;
    case "timetable":
      title = tTimetable("title");
      break;
    case "settings":
      title = tSettings("title");
      break;
    default:
      title = tSchool("dashboard");
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background px-3 md:hidden">
      <SidebarTrigger />
      <span className="text-sm font-medium">{title}</span>
    </header>
  );
}
