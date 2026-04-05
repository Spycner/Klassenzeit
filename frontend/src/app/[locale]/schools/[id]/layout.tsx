"use client";

import {
  ArrowLeft,
  BookOpen,
  Calendar,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useApiClient } from "@/hooks/use-api-client";
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";
import type { SchoolResponse } from "@/lib/types";

export default function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("school");
  const tc = useTranslations("common");
  const tCurriculum = useTranslations("curriculum");
  const tScheduler = useTranslations("scheduler");
  const tSettings = useTranslations("settings");
  const { logout } = useAuth();
  const { selectSchool } = useSchool();
  const apiClient = useApiClient();

  const [school, setSchool] = useState<SchoolResponse | null>(null);

  // Sync provider state from URL — drives X-School-Id header for child pages
  selectSchool(schoolId);

  useEffect(() => {
    apiClient
      .get<SchoolResponse>(`/api/schools/${schoolId}`)
      .then(setSchool)
      .catch(() => {});
  }, [apiClient, schoolId]);

  const isAdmin = school?.role === "admin";

  const navItems = [
    {
      title: t("dashboard"),
      href: `/${locale}/schools/${schoolId}`,
      icon: LayoutDashboard,
    },
    {
      title: t("members"),
      href: `/${locale}/schools/${schoolId}/members`,
      icon: Users,
    },
    {
      title: tCurriculum("title"),
      href: `/${locale}/schools/${schoolId}/curriculum`,
      icon: BookOpen,
    },
    {
      title: tScheduler("title"),
      href: `/${locale}/schools/${schoolId}/schedule`,
      icon: Calendar,
    },
    ...(isAdmin
      ? [
          {
            title: tSettings("title"),
            href: `/${locale}/schools/${schoolId}/settings`,
            icon: Settings,
          },
        ]
      : []),
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link
            href={`/${locale}/schools`}
            className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("allSchools")}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("navigation")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        {item.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              className="flex-1 justify-start gap-2"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              {tc("logout")}
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
