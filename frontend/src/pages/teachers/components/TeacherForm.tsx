import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type CreateTeacherInput,
  createTeacherSchema,
  type TeacherResponse,
  validate,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TeacherFormData = CreateTeacherInput;

interface TeacherFormProps {
  teacher?: TeacherResponse;
  onSubmit: (data: TeacherFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function TeacherForm({
  teacher,
  onSubmit,
  isSubmitting,
}: TeacherFormProps) {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(teacher?.firstName ?? "");
  const [lastName, setLastName] = useState(teacher?.lastName ?? "");
  const [email, setEmail] = useState(teacher?.email ?? "");
  const [abbreviation, setAbbreviation] = useState(teacher?.abbreviation ?? "");
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState<string>(
    teacher?.maxHoursPerWeek?.toString() ?? "",
  );
  const [isPartTime, setIsPartTime] = useState(teacher?.isPartTime ?? false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const formData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      abbreviation: abbreviation.trim(),
      maxHoursPerWeek: maxHoursPerWeek
        ? Number.parseInt(maxHoursPerWeek, 10)
        : undefined,
      isPartTime: isPartTime || undefined,
    };
    const result = validate(createTeacherSchema, formData);
    if (!result.success) return;
    await onSubmit(result.data);
  };

  const handleCancel = () => {
    navigate(`/${i18n.language}/teachers`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                {t("teachers.form.firstName")} *
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
                placeholder={t("teachers.form.firstNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">{t("teachers.form.lastName")} *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={100}
                placeholder={t("teachers.form.lastNamePlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="abbreviation">
                {t("teachers.form.abbreviation")} *
              </Label>
              <Input
                id="abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
                required
                maxLength={5}
                placeholder={t("teachers.form.abbreviationPlaceholder")}
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("teachers.form.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder={t("teachers.form.emailPlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxHoursPerWeek">
                {t("teachers.form.maxHoursPerWeek")}
              </Label>
              <Input
                id="maxHoursPerWeek"
                type="number"
                min={1}
                max={50}
                value={maxHoursPerWeek}
                onChange={(e) => setMaxHoursPerWeek(e.target.value)}
                placeholder={t("teachers.form.maxHoursPerWeekPlaceholder")}
              />
            </div>

            <div className="flex items-center space-x-3 pt-8">
              <Checkbox
                id="isPartTime"
                checked={isPartTime}
                onCheckedChange={(checked) => setIsPartTime(checked === true)}
              />
              <Label htmlFor="isPartTime" className="cursor-pointer">
                {t("teachers.form.isPartTime")}
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? tc("saving")
                : teacher
                  ? tc("save")
                  : t("teachers.form.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
