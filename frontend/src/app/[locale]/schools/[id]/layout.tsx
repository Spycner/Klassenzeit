"use client";

import {
  ArrowLeft,
  BookOpen,
  Calendar,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
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
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";

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
  const { logout } = useAuth();
  const { selectSchool } = useSchool();

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
  ];

  useEffect(() => {
    selectSchool(schoolId);
  }, [schoolId, selectSchool]);

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
                        pathname.startsWith(item.href + "/")
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
