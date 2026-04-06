"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadExampleButton } from "./load-example-button";
import { WizardShell } from "./wizard-shell";
import { resolveHref, WIZARD_STEPS } from "./wizard-steps";

type Props = {
  schoolId: string;
  open: boolean;
  initialStep?: number;
  onClose: () => void;
  onProgressChange: () => Promise<void>;
};

export function WizardDialog({
  schoolId,
  open,
  initialStep = 0,
  onClose,
  onProgressChange,
}: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const [stepIndex, setStepIndex] = useState(initialStep);

  const step = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const advance = async () => {
    await onProgressChange();
    if (isLast) {
      onClose();
    } else {
      setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
    }
  };

  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  // Strip the "onboarding." prefix so nested namespace translators can resolve
  // the rest ("steps.term.title" → useTranslations("onboarding")("steps.term.title")).
  const stepTitle = t(step.titleKey.replace(/^onboarding\./, "") as never);
  const stepDescription = t(
    step.descriptionKey.replace(/^onboarding\./, "") as never,
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
        </DialogHeader>
        <WizardShell
          stepIndex={stepIndex}
          totalSteps={WIZARD_STEPS.length}
          title={stepTitle}
          description={stepDescription}
          onBack={back}
          onSkip={advance}
          onNext={advance}
          isLast={isLast}
        >
          {step.id === "term" && (
            <div className="mb-4">
              <LoadExampleButton
                schoolId={schoolId}
                onLoaded={async () => {
                  await onProgressChange();
                  onClose();
                }}
              />
            </div>
          )}
          {step.Component ? (
            <step.Component />
          ) : (
            <div className="flex flex-col items-start gap-3 p-4 text-sm">
              <p>{t("steps.curriculum.openHint" as never)}</p>
              <Button asChild>
                <Link href={resolveHref(step, schoolId, locale)}>
                  {t("steps.curriculum.openButton" as never)}
                </Link>
              </Button>
            </div>
          )}
        </WizardShell>
      </DialogContent>
    </Dialog>
  );
}
