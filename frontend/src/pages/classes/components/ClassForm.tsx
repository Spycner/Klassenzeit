import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type CreateSchoolClassInput,
  createSchoolClassSchema,
  type SchoolClassResponse,
  useTeachers,
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

export type ClassFormData = CreateSchoolClassInput;

interface ClassFormProps {
  schoolClass?: SchoolClassResponse;
  schoolId: string;
  onSubmit: (data: ClassFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function ClassForm({
  schoolClass,
  schoolId,
  onSubmit,
  isSubmitting,
}: ClassFormProps) {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [name, setName] = useState(schoolClass?.name ?? "");
  const [gradeLevel, setGradeLevel] = useState(
    schoolClass?.gradeLevel?.toString() ?? "",
  );
  const [studentCount, setStudentCount] = useState(
    schoolClass?.studentCount?.toString() ?? "",
  );
  const [classTeacherId, setClassTeacherId] = useState(
    schoolClass?.classTeacherId ?? "",
  );

  const { data: teachers, isLoading: teachersLoading } = useTeachers(schoolId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const formData = {
      name: name.trim(),
      gradeLevel: Number.parseInt(gradeLevel, 10),
      studentCount: studentCount.trim()
        ? Number.parseInt(studentCount, 10)
        : undefined,
      classTeacherId: classTeacherId || undefined,
    };
    const result = validate(createSchoolClassSchema, formData);
    if (!result.success) return;
    await onSubmit(result.data);
  };

  const handleCancel = () => {
    navigate(`/${i18n.language}/classes`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("classes.form.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={20}
                placeholder={t("classes.form.namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gradeLevel">
                {t("classes.form.gradeLevel")} *
              </Label>
              <Input
                id="gradeLevel"
                type="number"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                required
                min={1}
                max={13}
                placeholder={t("classes.form.gradeLevelPlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="studentCount">
                {t("classes.form.studentCount")}
              </Label>
              <Input
                id="studentCount"
                type="number"
                value={studentCount}
                onChange={(e) => setStudentCount(e.target.value)}
                min={1}
                max={100}
                placeholder={t("classes.form.studentCountPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="classTeacher">
                {t("classes.form.classTeacher")}
              </Label>
              <Select
                value={classTeacherId || "none"}
                onValueChange={(value) =>
                  setClassTeacherId(value === "none" ? "" : value)
                }
                disabled={teachersLoading}
              >
                <SelectTrigger id="classTeacher">
                  <SelectValue
                    placeholder={
                      teachersLoading
                        ? tc("loading")
                        : t("classes.form.classTeacherPlaceholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("classes.form.classTeacherNone")}
                  </SelectItem>
                  {teachers?.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.firstName} {teacher.lastName} (
                      {teacher.abbreviation})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                : schoolClass
                  ? tc("save")
                  : t("classes.form.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
