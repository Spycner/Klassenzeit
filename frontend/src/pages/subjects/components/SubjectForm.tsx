import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type CreateSubjectInput,
  createSubjectSchema,
  type SubjectResponse,
  validate,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SubjectFormData = CreateSubjectInput;

interface SubjectFormProps {
  subject?: SubjectResponse;
  onSubmit: (data: SubjectFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function SubjectForm({
  subject,
  onSubmit,
  isSubmitting,
}: SubjectFormProps) {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [name, setName] = useState(subject?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(subject?.abbreviation ?? "");
  const [color, setColor] = useState(subject?.color ?? "");
  const [needsSpecialRoom, setNeedsSpecialRoom] = useState(
    subject?.needsSpecialRoom ?? false,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const formData = {
      name: name.trim(),
      abbreviation: abbreviation.trim(),
      color: color.trim() || undefined,
      needsSpecialRoom,
    };
    const result = validate(createSubjectSchema, formData);
    if (!result.success) return;
    await onSubmit(result.data);
  };

  const handleCancel = () => {
    navigate(`/${i18n.language}/subjects`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("subjects.form.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder={t("subjects.form.namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="abbreviation">
                {t("subjects.form.abbreviation")} *
              </Label>
              <Input
                id="abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
                required
                maxLength={10}
                placeholder={t("subjects.form.abbreviationPlaceholder")}
                className="uppercase"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="color">{t("subjects.form.color")}</Label>
              <ColorPicker
                value={color}
                onChange={setColor}
                placeholder={t("subjects.form.colorPlaceholder")}
              />
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="needsSpecialRoom"
              checked={needsSpecialRoom}
              onCheckedChange={(checked) =>
                setNeedsSpecialRoom(checked === true)
              }
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="needsSpecialRoom"
                className="font-medium cursor-pointer"
              >
                {t("subjects.form.needsSpecialRoom")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("subjects.form.needsSpecialRoomHelp")}
              </p>
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
                : subject
                  ? tc("save")
                  : t("subjects.form.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
