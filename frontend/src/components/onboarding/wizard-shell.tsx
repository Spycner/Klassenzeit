"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
  isLast: boolean;
  children: ReactNode;
};

export function WizardShell({
  stepIndex,
  totalSteps,
  title,
  description,
  onBack,
  onSkip,
  onNext,
  isLast,
  children,
}: Props) {
  const t = useTranslations("onboarding.buttons");
  const tw = useTranslations("onboarding.wizard");
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {tw("stepCounter", { current: stepIndex + 1, total: totalSteps })}
        </p>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={tw("progressLabel", { percent: progress })}
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-3">
        {children}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={stepIndex === 0}>
          {t("back")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip}>
            {t("skip")}
          </Button>
          <Button onClick={onNext}>{isLast ? t("finish") : t("next")}</Button>
        </div>
      </div>
    </div>
  );
}
