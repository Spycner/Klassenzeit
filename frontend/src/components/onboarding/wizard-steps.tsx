import type { ComponentType } from "react";
import { ClassesTab } from "@/app/[locale]/schools/[id]/settings/components/classes-tab";
import { RoomsTab } from "@/app/[locale]/schools/[id]/settings/components/rooms-tab";
import { SubjectsTab } from "@/app/[locale]/schools/[id]/settings/components/subjects-tab";
import { TeachersTab } from "@/app/[locale]/schools/[id]/settings/components/teachers-tab";
import { TermsTab } from "@/app/[locale]/schools/[id]/settings/components/terms-tab";
import { TimeslotsTab } from "@/app/[locale]/schools/[id]/settings/components/timeslots-tab";
import type { OnboardingStepId } from "@/hooks/use-onboarding-progress";

export type WizardStep = {
  id: OnboardingStepId;
  /** i18n key under `onboarding.steps.<id>.title`, stored as a string for grep-ability */
  titleKey: string;
  descriptionKey: string;
  /** Either a settings tab component to embed, or null for steps that need custom rendering. */
  Component: ComponentType | null;
  /** Path (without locale prefix) for the dashboard checklist deep-link. `{schoolId}` placeholder is replaced at render time. */
  href: string;
};

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "term",
    titleKey: "onboarding.steps.term.title",
    descriptionKey: "onboarding.steps.term.description",
    Component: TermsTab,
    href: "/schools/{schoolId}/settings?tab=terms",
  },
  {
    id: "classes",
    titleKey: "onboarding.steps.classes.title",
    descriptionKey: "onboarding.steps.classes.description",
    Component: ClassesTab,
    href: "/schools/{schoolId}/settings?tab=classes",
  },
  {
    id: "subjects",
    titleKey: "onboarding.steps.subjects.title",
    descriptionKey: "onboarding.steps.subjects.description",
    Component: SubjectsTab,
    href: "/schools/{schoolId}/settings?tab=subjects",
  },
  {
    id: "teachers",
    titleKey: "onboarding.steps.teachers.title",
    descriptionKey: "onboarding.steps.teachers.description",
    Component: TeachersTab,
    href: "/schools/{schoolId}/settings?tab=teachers",
  },
  {
    id: "rooms",
    titleKey: "onboarding.steps.rooms.title",
    descriptionKey: "onboarding.steps.rooms.description",
    Component: RoomsTab,
    href: "/schools/{schoolId}/settings?tab=rooms",
  },
  {
    id: "timeslots",
    titleKey: "onboarding.steps.timeslots.title",
    descriptionKey: "onboarding.steps.timeslots.description",
    Component: TimeslotsTab,
    href: "/schools/{schoolId}/settings?tab=timeslots",
  },
  {
    id: "curriculum",
    titleKey: "onboarding.steps.curriculum.title",
    descriptionKey: "onboarding.steps.curriculum.description",
    // Curriculum lives on its own page (frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx)
    // and depends on route params. We render a CTA button in the wizard instead of embedding it.
    Component: null,
    href: "/schools/{schoolId}/curriculum",
  },
] as const;

export function resolveHref(
  step: WizardStep,
  schoolId: string,
  locale: string,
): string {
  return `/${locale}${step.href.replace("{schoolId}", schoolId)}`;
}
