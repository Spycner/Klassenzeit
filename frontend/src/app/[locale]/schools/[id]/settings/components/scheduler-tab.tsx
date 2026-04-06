"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApiClient } from "@/hooks/use-api-client";
import {
  type ConstraintWeightsDto,
  DEFAULT_CONSTRAINT_WEIGHTS,
  type SchedulerSettingsResponse,
} from "@/lib/types";

type SoftKey =
  | "w_preferred_slot"
  | "w_teacher_gap"
  | "w_subject_distribution"
  | "w_class_teacher_first_period";

type SoftenKey =
  | "soften_teacher_availability"
  | "soften_teacher_max_hours"
  | "soften_teacher_qualification"
  | "soften_room_suitability"
  | "soften_room_capacity"
  | "soften_class_availability";

const SOFT_KEYS: SoftKey[] = [
  "w_preferred_slot",
  "w_teacher_gap",
  "w_subject_distribution",
  "w_class_teacher_first_period",
];

const SOFTEN_KEYS: SoftenKey[] = [
  "soften_teacher_availability",
  "soften_teacher_max_hours",
  "soften_teacher_qualification",
  "soften_room_suitability",
  "soften_room_capacity",
  "soften_class_availability",
];

const SOFT_I18N: Record<SoftKey, string> = {
  w_preferred_slot: "preferred_slot",
  w_teacher_gap: "teacher_gap",
  w_subject_distribution: "subject_distribution",
  w_class_teacher_first_period: "class_teacher_first_period",
};

const SOFTEN_I18N: Record<SoftenKey, string> = {
  soften_teacher_availability: "teacher_availability",
  soften_teacher_max_hours: "teacher_max_hours",
  soften_teacher_qualification: "teacher_qualification",
  soften_room_suitability: "room_suitability",
  soften_room_capacity: "room_capacity",
  soften_class_availability: "class_availability",
};

const DEFAULT_SOFTEN_PENALTY = 100;

export function SchedulerTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.scheduler");

  const [weights, setWeights] = useState<ConstraintWeightsDto>(
    DEFAULT_CONSTRAINT_WEIGHTS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<SchedulerSettingsResponse>(
        `/api/schools/${schoolId}/scheduler-settings`,
      )
      .then((resp) => setWeights(resp.weights))
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const resp = await apiClient.put<SchedulerSettingsResponse>(
        `/api/schools/${schoolId}/scheduler-settings`,
        weights,
      );
      setWeights(resp.weights);
      toast.success(t("saved_toast"));
    } catch {
      toast.error(t("error_toast"));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setWeights(DEFAULT_CONSTRAINT_WEIGHTS);
  }

  function setSoft(key: SoftKey, value: number) {
    setWeights((w) => ({ ...w, [key]: value }));
  }

  function setSoftenMode(key: SoftenKey, strict: boolean) {
    setWeights((w) => ({
      ...w,
      [key]: strict ? null : DEFAULT_SOFTEN_PENALTY,
    }));
  }

  function setSoftenPenalty(key: SoftenKey, penalty: number) {
    setWeights((w) => ({ ...w, [key]: penalty }));
  }

  if (loading) {
    return <p className="text-muted-foreground">{t("saving")}</p>;
  }

  return (
    <div className="flex flex-col gap-8 p-4" data-testid="scheduler-tab">
      {/* Soft constraint weights */}
      <section>
        <h3 className="text-lg font-semibold">{t("section_soft")}</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("section_soft_description")}
        </p>
        <div className="flex flex-col gap-3">
          {SOFT_KEYS.map((key) => {
            const name = SOFT_I18N[key];
            const value = weights[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <Label htmlFor={key}>{t(`constraints.${name}.label`)}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`constraints.${name}.description`)}
                  </p>
                </div>
                <Input
                  id={key}
                  data-testid={`soft-${key}`}
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  className="w-24"
                  value={value}
                  onChange={(e) =>
                    setSoft(key, Number.parseInt(e.target.value, 10) || 0)
                  }
                />
                {value === 0 && (
                  <span className="w-20 text-xs text-muted-foreground">
                    {t("disabled_hint")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Hard constraint relaxation */}
      <section>
        <h3 className="text-lg font-semibold">{t("section_hard")}</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("section_hard_description")}
        </p>
        <div className="flex flex-col gap-4">
          {SOFTEN_KEYS.map((key) => {
            const name = SOFTEN_I18N[key];
            const value = weights[key];
            const strict = value === null;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <Label>{t(`constraints.${name}.label`)}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`constraints.${name}.description`)}
                  </p>
                </div>
                <RadioGroup
                  value={strict ? "strict" : "allow"}
                  onValueChange={(v) => setSoftenMode(key, v === "strict")}
                  className="flex gap-4"
                  data-testid={`mode-${key}`}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="strict" id={`${key}-strict`} />
                    <Label htmlFor={`${key}-strict`}>{t("strict")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="allow" id={`${key}-allow`} />
                    <Label htmlFor={`${key}-allow`}>
                      {t("allow_with_penalty")}
                    </Label>
                  </div>
                </RadioGroup>
                <Input
                  data-testid={`penalty-${key}`}
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  className="w-28"
                  disabled={strict}
                  value={value ?? DEFAULT_SOFTEN_PENALTY}
                  onChange={(e) =>
                    setSoftenPenalty(
                      key,
                      Number.parseInt(e.target.value, 10) ||
                        DEFAULT_SOFTEN_PENALTY,
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          {t("reset_defaults")}
        </Button>
      </div>
    </div>
  );
}
