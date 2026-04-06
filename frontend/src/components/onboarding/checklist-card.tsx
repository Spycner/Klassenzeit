"use client";

import { Check, Circle, Play } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingProgress } from "@/hooks/use-onboarding-progress";
import { resolveHref, WIZARD_STEPS } from "./wizard-steps";

type Props = {
  schoolId: string;
  progress: OnboardingProgress;
  onResume: () => void;
};

export function ChecklistCard({ schoolId, progress, onResume }: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale();

  if (progress.allComplete) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("checklist.title")}</CardTitle>
        <Button size="sm" onClick={onResume}>
          <Play className="mr-2 h-4 w-4" />
          {t("checklist.resume")}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {WIZARD_STEPS.map((step) => {
            const state = progress.steps[step.id];
            const Icon = state.done ? Check : Circle;
            const title = t(
              step.titleKey.replace(/^onboarding\./, "") as never,
            );
            return (
              <li
                key={step.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={
                      state.done
                        ? "h-4 w-4 text-primary"
                        : "h-4 w-4 text-muted-foreground"
                    }
                  />
                  <span className="text-sm">{title}</span>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={resolveHref(step, schoolId, locale)}>
                    {state.done ? t("checklist.review") : t("checklist.open")}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
