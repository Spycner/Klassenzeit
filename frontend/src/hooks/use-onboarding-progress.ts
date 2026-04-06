import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/hooks/use-api-client";

export const ONBOARDING_STEP_IDS = [
  "term",
  "classes",
  "subjects",
  "teachers",
  "rooms",
  "timeslots",
  "curriculum",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStepState = {
  done: boolean;
  count: number;
};

export type OnboardingProgress = {
  loading: boolean;
  error: string | null;
  steps: Record<OnboardingStepId, OnboardingStepState>;
  allComplete: boolean;
  isEmpty: boolean;
  firstIncomplete: OnboardingStepId | null;
  refetch: () => Promise<void>;
};

const EMPTY_STEPS: Record<OnboardingStepId, OnboardingStepState> = {
  term: { done: false, count: 0 },
  classes: { done: false, count: 0 },
  subjects: { done: false, count: 0 },
  teachers: { done: false, count: 0 },
  rooms: { done: false, count: 0 },
  timeslots: { done: false, count: 0 },
  curriculum: { done: false, count: 0 },
};

export function useOnboardingProgress(schoolId: string): OnboardingProgress {
  const apiClient = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] =
    useState<Record<OnboardingStepId, OnboardingStepState>>(EMPTY_STEPS);
  const requestIdRef = useRef(0);

  const fetchAll = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      setError(null);
      return;
    }
    const thisRequest = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [terms, classes, subjects, teachers, rooms, timeslots] =
        await Promise.all([
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/terms`),
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/classes`),
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/subjects`),
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/teachers`),
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/rooms`),
          apiClient.get<unknown[]>(`/api/schools/${schoolId}/time-slots`),
        ]);

      let curriculum: unknown[] = [];
      const firstTerm = terms[0] as { id?: string } | undefined;
      if (firstTerm?.id) {
        curriculum = await apiClient.get<unknown[]>(
          `/api/schools/${schoolId}/terms/${firstTerm.id}/curriculum`,
        );
      }

      if (requestIdRef.current !== thisRequest) return;
      setSteps({
        term: { count: terms.length, done: terms.length > 0 },
        classes: { count: classes.length, done: classes.length > 0 },
        subjects: { count: subjects.length, done: subjects.length > 0 },
        teachers: { count: teachers.length, done: teachers.length > 0 },
        rooms: { count: rooms.length, done: rooms.length > 0 },
        timeslots: { count: timeslots.length, done: timeslots.length > 0 },
        curriculum: {
          count: curriculum.length,
          done: curriculum.length > 0,
        },
      });
    } catch (e) {
      if (requestIdRef.current !== thisRequest) return;
      setError(
        e instanceof Error ? e.message : "Failed to load onboarding progress",
      );
    } finally {
      if (requestIdRef.current === thisRequest) {
        setLoading(false);
      }
    }
  }, [apiClient, schoolId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const allComplete = ONBOARDING_STEP_IDS.every((id) => steps[id].done);
  const isEmpty = ONBOARDING_STEP_IDS.every((id) => steps[id].count === 0);
  const firstIncomplete: OnboardingStepId | null =
    ONBOARDING_STEP_IDS.find((id) => !steps[id].done) ?? null;

  return {
    loading,
    error,
    steps,
    allComplete,
    isEmpty,
    firstIncomplete,
    refetch: fetchAll,
  };
}
