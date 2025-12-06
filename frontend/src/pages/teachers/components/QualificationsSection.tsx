import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type QualificationLevel,
  type QualificationSummary,
  useCreateQualification,
  useCreateSubject,
  useDeleteQualification,
  useQualifications,
  useSubjects,
} from "@/api";
import { LoadingState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Generate an abbreviation from a subject name.
 * Takes first 3 characters of the first word, uppercase.
 * If name has multiple words, takes first letter of each word (up to 5 chars).
 */
function generateAbbreviation(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    // Single word: take first 3-4 characters
    return trimmed.slice(0, 3).toUpperCase();
  }
  // Multiple words: take first letter of each (up to 5)
  return words
    .slice(0, 5)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

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

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] =
    useState<QualificationLevel>("PRIMARY");

  // State for creating a new subject
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectAbbreviation, setNewSubjectAbbreviation] = useState("");

  const { data: qualifications, isLoading: qualificationsLoading } =
    useQualifications(schoolId, teacherId);
  const { data: subjects, isLoading: subjectsLoading } = useSubjects(schoolId);

  const createQualificationMutation = useCreateQualification(
    schoolId,
    teacherId,
  );
  const createSubjectMutation = useCreateSubject(schoolId);
  const deleteMutation = useDeleteQualification(schoolId, teacherId);

  const isLoading = qualificationsLoading || subjectsLoading;
  const isSaving =
    createQualificationMutation.isPending || createSubjectMutation.isPending;

  // Filter out subjects that are already qualified
  const availableSubjects = useMemo(
    () =>
      subjects?.filter(
        (subject) => !qualifications?.some((q) => q.subjectId === subject.id),
      ) ?? [],
    [subjects, qualifications],
  );

  // Get the selected subject's name for display
  const selectedSubjectName = useMemo(
    () => availableSubjects.find((s) => s.id === selectedSubjectId)?.name ?? "",
    [availableSubjects, selectedSubjectId],
  );

  const resetForm = () => {
    setSelectedSubjectId("");
    setSelectedLevel("PRIMARY");
    setSearchValue("");
    setIsCreatingNew(false);
    setNewSubjectName("");
    setNewSubjectAbbreviation("");
    setIsAdding(false);
  };

  const handleSelectExisting = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setIsCreatingNew(false);
    setNewSubjectName("");
    setNewSubjectAbbreviation("");
    setComboboxOpen(false);
  };

  const handleSelectCreateNew = (name: string) => {
    setSelectedSubjectId("");
    setIsCreatingNew(true);
    setNewSubjectName(name);
    setNewSubjectAbbreviation(generateAbbreviation(name));
    setComboboxOpen(false);
  };

  const handleAdd = async () => {
    let subjectId = selectedSubjectId;

    // If creating a new subject, create it first
    if (isCreatingNew && newSubjectName && newSubjectAbbreviation) {
      const newSubject = await createSubjectMutation.mutateAsync({
        name: newSubjectName.trim(),
        abbreviation: newSubjectAbbreviation.trim().toUpperCase(),
      });
      subjectId = newSubject.id;
    }

    if (!subjectId) return;

    await createQualificationMutation.mutateAsync({
      subjectId,
      qualificationLevel: selectedLevel,
    });

    resetForm();
  };

  const handleRemove = async (qualificationId: string) => {
    await deleteMutation.mutateAsync(qualificationId);
  };

  // Check if we can submit the form
  const canSubmit =
    (selectedSubjectId ||
      (isCreatingNew && newSubjectName && newSubjectAbbreviation)) &&
    !isSaving;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          {t("teachers.qualifications.title")}
        </CardTitle>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
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
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Subject combobox with create option */}
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <span className="text-sm font-medium">
                      {t("teachers.qualifications.subject")}
                    </span>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-expanded={comboboxOpen}
                          aria-label={t("teachers.qualifications.subject")}
                          className="w-full justify-between font-normal"
                        >
                          {isCreatingNew
                            ? t("teachers.qualifications.createNew", {
                                name: newSubjectName,
                              })
                            : selectedSubjectName ||
                              t("teachers.qualifications.selectSubject")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder={t(
                              "teachers.qualifications.searchSubject",
                            )}
                            value={searchValue}
                            onValueChange={setSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t("teachers.qualifications.noSubjectsFound")}
                            </CommandEmpty>
                            <CommandGroup>
                              {/* Existing subjects filtered by search */}
                              {availableSubjects
                                .filter((s) =>
                                  s.name
                                    .toLowerCase()
                                    .includes(searchValue.toLowerCase()),
                                )
                                .map((subject) => (
                                  <CommandItem
                                    key={subject.id}
                                    value={subject.id}
                                    onSelect={() =>
                                      handleSelectExisting(subject.id)
                                    }
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedSubjectId === subject.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {subject.name}
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      ({subject.abbreviation})
                                    </span>
                                  </CommandItem>
                                ))}
                              {/* Create new option when search has text and no exact match exists */}
                              {searchValue.trim() &&
                                !subjects?.some(
                                  (s) =>
                                    s.name.toLowerCase() ===
                                    searchValue.trim().toLowerCase(),
                                ) && (
                                  <CommandItem
                                    value={`create-${searchValue}`}
                                    onSelect={() =>
                                      handleSelectCreateNew(searchValue.trim())
                                    }
                                    className="text-primary"
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t("teachers.qualifications.createNew", {
                                      name: searchValue.trim(),
                                    })}
                                  </CommandItem>
                                )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Qualification level */}
                  <div className="min-w-[150px] space-y-1.5">
                    <span className="text-sm font-medium">
                      {t("teachers.qualifications.level")}
                    </span>
                    <Select
                      value={selectedLevel}
                      onValueChange={(v) =>
                        setSelectedLevel(v as QualificationLevel)
                      }
                    >
                      <SelectTrigger
                        aria-label={t("teachers.qualifications.level")}
                      >
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
                </div>

                {/* New subject fields (shown when creating new) */}
                {isCreatingNew && (
                  <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/50 p-3">
                    <div className="flex-1 min-w-[200px] space-y-1.5">
                      <span className="text-sm font-medium">
                        {t("teachers.qualifications.newSubjectName")}
                      </span>
                      <Input
                        value={newSubjectName}
                        onChange={(e) => {
                          setNewSubjectName(e.target.value);
                          setNewSubjectAbbreviation(
                            generateAbbreviation(e.target.value),
                          );
                        }}
                        placeholder={t(
                          "teachers.qualifications.newSubjectNamePlaceholder",
                        )}
                      />
                    </div>
                    <div className="w-[120px] space-y-1.5">
                      <span className="text-sm font-medium">
                        {t("teachers.qualifications.abbreviation")}
                      </span>
                      <Input
                        value={newSubjectAbbreviation}
                        onChange={(e) =>
                          setNewSubjectAbbreviation(
                            e.target.value.toUpperCase(),
                          )
                        }
                        placeholder="MAT"
                        maxLength={10}
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} disabled={!canSubmit}>
                    {isSaving
                      ? t("common:saving")
                      : t("teachers.qualifications.add")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetForm}>
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
        (
        {t(
          `teachers.qualifications.levels.${qualification.qualificationLevel}`,
        )}
        )
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
