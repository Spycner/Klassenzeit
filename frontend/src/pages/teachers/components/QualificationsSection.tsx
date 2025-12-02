import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateQualification,
  useDeleteQualification,
  useQualifications,
  useSubjects,
  type QualificationLevel,
  type QualificationSummary,
} from "@/api";
import { LoadingState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface QualificationsSectionProps {
  schoolId: string;
  teacherId: string;
}

const QUALIFICATION_LEVELS: QualificationLevel[] = [
  "PRIMARY",
  "SECONDARY",
  "SUBSTITUTE",
];

function getLevelColor(level: QualificationLevel): string {
  switch (level) {
    case "PRIMARY":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "SECONDARY":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "SUBSTITUTE":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "";
  }
}

export function QualificationsSection({
  schoolId,
  teacherId,
}: QualificationsSectionProps) {
  const { t } = useTranslation("pages");

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<QualificationLevel>("PRIMARY");
  const [isAdding, setIsAdding] = useState(false);

  const { data: qualifications, isLoading: qualificationsLoading } =
    useQualifications(schoolId, teacherId);
  const { data: subjects, isLoading: subjectsLoading } = useSubjects(schoolId);

  const createMutation = useCreateQualification(schoolId, teacherId);
  const deleteMutation = useDeleteQualification(schoolId, teacherId);

  const isLoading = qualificationsLoading || subjectsLoading;

  // Filter out subjects that are already qualified
  const availableSubjects = subjects?.filter(
    (subject) =>
      !qualifications?.some((q) => q.subjectId === subject.id),
  );

  const handleAdd = async () => {
    if (!selectedSubjectId) return;

    await createMutation.mutateAsync({
      subjectId: selectedSubjectId,
      qualificationLevel: selectedLevel,
    });

    setSelectedSubjectId("");
    setSelectedLevel("PRIMARY");
    setIsAdding(false);
  };

  const handleRemove = async (qualificationId: string) => {
    await deleteMutation.mutateAsync(qualificationId);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          {t("teachers.qualifications.title")}
        </CardTitle>
        {!isAdding && availableSubjects && availableSubjects.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("teachers.qualifications.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {/* Add qualification form */}
            {isAdding && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <span className="text-sm font-medium">
                    {t("teachers.qualifications.subject")}
                  </span>
                  <Select
                    value={selectedSubjectId}
                    onValueChange={setSelectedSubjectId}
                  >
                    <SelectTrigger aria-label={t("teachers.qualifications.subject")}>
                      <SelectValue
                        placeholder={t("teachers.qualifications.selectSubject")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubjects?.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[150px] space-y-1.5">
                  <span className="text-sm font-medium">
                    {t("teachers.qualifications.level")}
                  </span>
                  <Select
                    value={selectedLevel}
                    onValueChange={(v) => setSelectedLevel(v as QualificationLevel)}
                  >
                    <SelectTrigger aria-label={t("teachers.qualifications.level")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALIFICATION_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {t(`teachers.qualifications.levels.${level}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={!selectedSubjectId || createMutation.isPending}
                  >
                    {t("teachers.qualifications.add")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAdding(false);
                      setSelectedSubjectId("");
                    }}
                  >
                    {t("common:cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* Qualifications list */}
            {qualifications && qualifications.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {qualifications.map((qualification) => (
                  <QualificationPill
                    key={qualification.id}
                    qualification={qualification}
                    onRemove={() => handleRemove(qualification.id)}
                    isRemoving={deleteMutation.isPending}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              !isAdding && (
                <p className="text-sm text-muted-foreground">
                  {t("teachers.qualifications.empty")}
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface QualificationPillProps {
  qualification: QualificationSummary;
  onRemove: () => void;
  isRemoving: boolean;
  t: (key: string) => string;
}

function QualificationPill({
  qualification,
  onRemove,
  isRemoving,
  t,
}: QualificationPillProps) {
  return (
    <div
      className={cn(
        "group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
        getLevelColor(qualification.qualificationLevel),
      )}
    >
      <span>{qualification.subjectName}</span>
      <span className="text-xs opacity-70">
        ({t(`teachers.qualifications.levels.${qualification.qualificationLevel}`)})
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={isRemoving}
        className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
        aria-label={t("teachers.qualifications.remove")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
