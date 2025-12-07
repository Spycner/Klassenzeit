import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import {
  type CreateSchoolInput,
  createSchoolSchema,
  type SchoolResponse,
  type UpdateSchoolInput,
  updateSchoolSchema,
  validate,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { UserSearchField } from "./UserSearchField";

export type SchoolFormData = CreateSchoolInput | UpdateSchoolInput;

interface SchoolFormProps {
  school?: SchoolResponse;
  onSubmit: (data: SchoolFormData) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
}

const SCHOOL_TYPES = [
  "Grundschule",
  "Hauptschule",
  "Realschule",
  "Gymnasium",
  "Gesamtschule",
  "Berufsschule",
  "Förderschule",
];

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Paris",
];

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function SchoolForm({
  school,
  onSubmit,
  isSubmitting,
  disabled = false,
}: SchoolFormProps) {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const isNew = !school;

  const [name, setName] = useState(school?.name ?? "");
  const [slug, setSlug] = useState(school?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [schoolType, setSchoolType] = useState(school?.schoolType ?? "");
  const [minGrade, setMinGrade] = useState<string>(
    school?.minGrade?.toString() ?? "1",
  );
  const [maxGrade, setMaxGrade] = useState<string>(
    school?.maxGrade?.toString() ?? "13",
  );
  const [timezone, setTimezone] = useState(school?.timezone ?? "Europe/Berlin");
  const [initialAdminUserId, setInitialAdminUserId] = useState<string | null>(
    null,
  );

  // Auto-generate slug from name (only if not editing and not manually touched)
  useEffect(() => {
    if (!school && !slugTouched && name) {
      setSlug(generateSlug(name));
    }
  }, [name, school, slugTouched]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const baseFormData = {
      name: name.trim(),
      slug: slug.trim(),
      schoolType: schoolType.trim(),
      minGrade: Number.parseInt(minGrade, 10),
      maxGrade: Number.parseInt(maxGrade, 10),
      timezone: timezone || undefined,
      settings: school?.settings ?? undefined,
    };

    if (isNew) {
      // Creating a new school requires an initial admin
      const createFormData = {
        ...baseFormData,
        initialAdminUserId: initialAdminUserId ?? "",
      };
      const result = validate(createSchoolSchema, createFormData);
      if (!result.success) return;
      await onSubmit(result.data);
    } else {
      // Updating an existing school
      const result = validate(updateSchoolSchema, baseFormData);
      if (!result.success) return;
      await onSubmit(result.data);
    }
  };

  const handleCancel = () => {
    navigate(`/${i18n.language}/schools`);
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    // Only allow valid slug characters
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("schools.form.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder={t("schools.form.namePlaceholder")}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">{t("schools.form.slug")} *</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                maxLength={100}
                placeholder={t("schools.form.slugPlaceholder")}
                disabled={disabled}
                className="lowercase"
              />
              <p className="text-xs text-muted-foreground">
                {t("schools.form.slugHelp")}
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schoolType">
                {t("schools.form.schoolType")} *
              </Label>
              <Select
                value={schoolType}
                onValueChange={setSchoolType}
                disabled={disabled}
              >
                <SelectTrigger id="schoolType">
                  <SelectValue
                    placeholder={t("schools.form.schoolTypePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {SCHOOL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">{t("schools.form.timezone")}</Label>
              <Select
                value={timezone}
                onValueChange={setTimezone}
                disabled={disabled}
              >
                <SelectTrigger id="timezone">
                  <SelectValue
                    placeholder={t("schools.form.timezonePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minGrade">{t("schools.form.minGrade")} *</Label>
              <Input
                id="minGrade"
                type="number"
                min={1}
                max={13}
                value={minGrade}
                onChange={(e) => setMinGrade(e.target.value)}
                required
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxGrade">{t("schools.form.maxGrade")} *</Label>
              <Input
                id="maxGrade"
                type="number"
                min={1}
                max={13}
                value={maxGrade}
                onChange={(e) => setMaxGrade(e.target.value)}
                required
                disabled={disabled}
              />
            </div>
          </div>

          {isNew && (
            <div className="border-t pt-6">
              <UserSearchField
                label={t("schools.form.admin.label")}
                value={initialAdminUserId}
                onSelect={(userId) => setInitialAdminUserId(userId)}
                required
                disabled={disabled}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || disabled}>
              {isSubmitting
                ? tc("saving")
                : school
                  ? tc("save")
                  : t("schools.form.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
