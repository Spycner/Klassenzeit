import { Code, Settings } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type SchoolResponse, useUpdateSchool } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface SchoolSettingsSectionProps {
  school: SchoolResponse;
  disabled?: boolean;
}

interface SchoolSettings {
  lessonDuration: number;
  breakDurations: {
    short: number;
    long: number;
  };
  maxPeriodsPerDay: number;
  features: {
    substitutionManagement: boolean;
    parentPortal: boolean;
  };
}

const DEFAULT_SETTINGS: SchoolSettings = {
  lessonDuration: 45,
  breakDurations: {
    short: 5,
    long: 20,
  },
  maxPeriodsPerDay: 10,
  features: {
    substitutionManagement: false,
    parentPortal: false,
  },
};

function parseSettings(json: string | null): SchoolSettings {
  if (!json) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(json);
    return {
      lessonDuration: parsed.lessonDuration ?? DEFAULT_SETTINGS.lessonDuration,
      breakDurations: {
        short:
          parsed.breakDurations?.short ?? DEFAULT_SETTINGS.breakDurations.short,
        long:
          parsed.breakDurations?.long ?? DEFAULT_SETTINGS.breakDurations.long,
      },
      maxPeriodsPerDay:
        parsed.maxPeriodsPerDay ?? DEFAULT_SETTINGS.maxPeriodsPerDay,
      features: {
        substitutionManagement:
          parsed.features?.substitutionManagement ??
          DEFAULT_SETTINGS.features.substitutionManagement,
        parentPortal:
          parsed.features?.parentPortal ??
          DEFAULT_SETTINGS.features.parentPortal,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function stringifySettings(settings: SchoolSettings): string {
  return JSON.stringify(settings, null, 2);
}

export function SchoolSettingsSection({
  school,
  disabled = false,
}: SchoolSettingsSectionProps) {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");

  const [showJson, setShowJson] = useState(false);
  const [settings, setSettings] = useState<SchoolSettings>(() =>
    parseSettings(school.settings),
  );
  const [jsonText, setJsonText] = useState(() =>
    stringifySettings(parseSettings(school.settings)),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [jsonError, setJsonError] = useState(false);

  // Check if school has saved settings or is using defaults
  const isUsingDefaults = !school.settings;

  const updateMutation = useUpdateSchool();

  // Sync JSON text when settings change (from UI)
  useEffect(() => {
    if (!showJson) {
      setJsonText(stringifySettings(settings));
    }
  }, [settings, showJson]);

  const checkForChanges = (newSettings: SchoolSettings) => {
    const original = parseSettings(school.settings);
    const changed = JSON.stringify(newSettings) !== JSON.stringify(original);
    setHasChanges(changed);
  };

  const updateSetting = <K extends keyof SchoolSettings>(
    key: K,
    value: SchoolSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    checkForChanges(newSettings);
  };

  const updateNestedSetting = <
    K extends keyof SchoolSettings,
    NK extends keyof SchoolSettings[K],
  >(
    key: K,
    nestedKey: NK,
    value: SchoolSettings[K][NK],
  ) => {
    const newSettings = {
      ...settings,
      [key]: { ...(settings[key] as object), [nestedKey]: value },
    };
    setSettings(newSettings);
    checkForChanges(newSettings);
  };

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      JSON.parse(value); // Validate JSON syntax
      const newSettings = parseSettings(value);
      setSettings(newSettings);
      setJsonError(false);
      checkForChanges(newSettings);
    } catch {
      setJsonError(true);
      setHasChanges(true);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (showJson && jsonError) {
      toast.error(t("schools.settings.invalidJson"));
      return;
    }

    const settingsJson = stringifySettings(settings);

    await updateMutation.mutateAsync({
      id: school.id,
      data: {
        name: school.name,
        slug: school.slug,
        schoolType: school.schoolType,
        minGrade: school.minGrade,
        maxGrade: school.maxGrade,
        timezone: school.timezone ?? undefined,
        settings: settingsJson,
      },
    });

    setHasChanges(false);
    toast.success(t("schools.settings.saved"));
  };

  const handleReset = () => {
    const original = parseSettings(school.settings);
    setSettings(original);
    setJsonText(stringifySettings(original));
    setHasChanges(false);
    setJsonError(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">
            {t("schools.settings.title")}
          </CardTitle>
          {isUsingDefaults && !hasChanges && (
            <p className="text-sm text-muted-foreground">
              {t("schools.settings.usingDefaults")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowJson(!showJson)}
          className="gap-2"
        >
          {showJson ? (
            <>
              <Settings className="h-4 w-4" />
              {t("schools.settings.showForm")}
            </>
          ) : (
            <>
              <Code className="h-4 w-4" />
              {t("schools.settings.showJson")}
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {showJson ? (
            <div className="space-y-2">
              <Label htmlFor="settings">{t("schools.settings.json")}</Label>
              <Textarea
                id="settings"
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                disabled={disabled}
                rows={12}
                className={cn(
                  "font-mono text-sm",
                  jsonError && "border-destructive",
                )}
                placeholder="{}"
              />
              {jsonError && (
                <p className="text-sm text-destructive">
                  {t("schools.settings.invalidJson")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Lesson Timing */}
              <div className="space-y-4">
                <h4 className="font-medium">
                  {t("schools.settings.timing.title")}
                </h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="lessonDuration">
                      {t("schools.settings.timing.lessonDuration")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="lessonDuration"
                        type="number"
                        min={15}
                        max={120}
                        value={settings.lessonDuration}
                        onChange={(e) =>
                          updateSetting(
                            "lessonDuration",
                            Number.parseInt(e.target.value, 10) || 45,
                          )
                        }
                        disabled={disabled}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        {t("schools.settings.timing.minutes")}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shortBreak">
                      {t("schools.settings.timing.shortBreak")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="shortBreak"
                        type="number"
                        min={0}
                        max={30}
                        value={settings.breakDurations.short}
                        onChange={(e) =>
                          updateNestedSetting(
                            "breakDurations",
                            "short",
                            Number.parseInt(e.target.value, 10) || 5,
                          )
                        }
                        disabled={disabled}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        {t("schools.settings.timing.minutes")}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="longBreak">
                      {t("schools.settings.timing.longBreak")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="longBreak"
                        type="number"
                        min={0}
                        max={60}
                        value={settings.breakDurations.long}
                        onChange={(e) =>
                          updateNestedSetting(
                            "breakDurations",
                            "long",
                            Number.parseInt(e.target.value, 10) || 20,
                          )
                        }
                        disabled={disabled}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        {t("schools.settings.timing.minutes")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxPeriods">
                    {t("schools.settings.timing.maxPeriods")}
                  </Label>
                  <Input
                    id="maxPeriods"
                    type="number"
                    min={1}
                    max={15}
                    value={settings.maxPeriodsPerDay}
                    onChange={(e) =>
                      updateSetting(
                        "maxPeriodsPerDay",
                        Number.parseInt(e.target.value, 10) || 10,
                      )
                    }
                    disabled={disabled}
                    className="w-24"
                  />
                </div>
              </div>

              <Separator />

              {/* Features */}
              <div className="space-y-4">
                <h4 className="font-medium">
                  {t("schools.settings.features.title")}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="substitutionManagement"
                      checked={settings.features.substitutionManagement}
                      onCheckedChange={(checked) =>
                        updateNestedSetting(
                          "features",
                          "substitutionManagement",
                          checked === true,
                        )
                      }
                      disabled={disabled}
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="substitutionManagement"
                        className="cursor-pointer"
                      >
                        {t("schools.settings.features.substitution")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("schools.settings.features.substitutionDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="parentPortal"
                      checked={settings.features.parentPortal}
                      onCheckedChange={(checked) =>
                        updateNestedSetting(
                          "features",
                          "parentPortal",
                          checked === true,
                        )
                      }
                      disabled={disabled}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="parentPortal" className="cursor-pointer">
                        {t("schools.settings.features.parentPortal")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("schools.settings.features.parentPortalDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!disabled && (
            <div className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || updateMutation.isPending}
              >
                {tc("reset")}
              </Button>
              <Button
                type="submit"
                disabled={
                  !hasChanges ||
                  (showJson && jsonError) ||
                  updateMutation.isPending
                }
              >
                {updateMutation.isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
