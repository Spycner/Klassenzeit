import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type RoomSubjectSuitabilitySummary,
  useCreateRoomSubject,
  useDeleteRoomSubject,
  useRoomSubjects,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, fuzzyMatch } from "@/lib/utils";

interface SubjectSuitabilitySectionProps {
  schoolId: string;
  roomId: string;
}

export function SubjectSuitabilitySection({
  schoolId,
  roomId,
}: SubjectSuitabilitySectionProps) {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: suitabilities, isLoading: suitabilitiesLoading } =
    useRoomSubjects(schoolId, roomId);
  const { data: subjects, isLoading: subjectsLoading } = useSubjects(schoolId);

  const createMutation = useCreateRoomSubject(schoolId, roomId);
  const deleteMutation = useDeleteRoomSubject(schoolId, roomId);

  const isLoading = suitabilitiesLoading || subjectsLoading;
  const isSaving = createMutation.isPending;

  // Filter to only show subjects that need a special room and are not already assigned
  const availableSubjects = useMemo(
    () =>
      subjects?.filter(
        (subject) =>
          subject.needsSpecialRoom &&
          !suitabilities?.some((s) => s.subjectId === subject.id),
      ) ?? [],
    [subjects, suitabilities],
  );

  // Check if there are any special-room subjects at all
  const hasSpecialRoomSubjects = useMemo(
    () => subjects?.some((s) => s.needsSpecialRoom) ?? false,
    [subjects],
  );

  // Get the selected subject's name for display
  const selectedSubjectName = useMemo(
    () => availableSubjects.find((s) => s.id === selectedSubjectId)?.name ?? "",
    [availableSubjects, selectedSubjectId],
  );

  const resetForm = () => {
    setSelectedSubjectId("");
    setSearchValue("");
    setIsAdding(false);
  };

  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setComboboxOpen(false);
  };

  const handleAdd = async () => {
    if (!selectedSubjectId) return;

    await createMutation.mutateAsync({
      subjectId: selectedSubjectId,
    });

    resetForm();
  };

  const handleRemove = async (suitabilityId: string) => {
    setRemovingId(suitabilityId);
    try {
      await deleteMutation.mutateAsync(suitabilityId);
    } finally {
      setRemovingId(null);
    }
  };

  const canSubmit = selectedSubjectId && !isSaving;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t("rooms.subjects.title")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("rooms.subjects.description")}
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("rooms.subjects.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {/* Add suitability form */}
            {isAdding && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Subject combobox */}
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <span className="text-sm font-medium">
                      {t("rooms.subjects.subject")}
                    </span>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-expanded={comboboxOpen}
                          aria-label={t("rooms.subjects.subject")}
                          className="w-full justify-between font-normal"
                        >
                          {selectedSubjectName ||
                            t("rooms.subjects.selectSubject")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder={t("rooms.subjects.searchSubject")}
                            value={searchValue}
                            onValueChange={setSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t("rooms.subjects.noSubjectsFound")}
                            </CommandEmpty>
                            <CommandGroup>
                              {availableSubjects
                                .filter(
                                  (s) =>
                                    fuzzyMatch(s.name, searchValue) ||
                                    fuzzyMatch(s.abbreviation, searchValue),
                                )
                                .map((subject) => (
                                  <CommandItem
                                    key={subject.id}
                                    value={subject.id}
                                    onSelect={() =>
                                      handleSelectSubject(subject.id)
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
                                    <span className="ml-2 text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground">
                                      ({subject.abbreviation})
                                    </span>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} disabled={!canSubmit}>
                    {isSaving ? tc("saving") : t("rooms.subjects.add")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetForm}>
                    {tc("cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* Suitabilities list */}
            {suitabilities && suitabilities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suitabilities.map((suitability) => (
                  <SuitabilityPill
                    key={suitability.id}
                    suitability={suitability}
                    onRemove={() => handleRemove(suitability.id!)}
                    isRemoving={removingId === suitability.id}
                    t={t}
                  />
                ))}
              </div>
            ) : !isAdding ? (
              <p className="text-sm text-muted-foreground">
                {hasSpecialRoomSubjects
                  ? t("rooms.subjects.empty")
                  : t("rooms.subjects.noSpecialSubjects")}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SuitabilityPillProps {
  suitability: RoomSubjectSuitabilitySummary;
  onRemove: () => void;
  isRemoving: boolean;
  t: (key: string) => string;
}

function SuitabilityPill({
  suitability,
  onRemove,
  isRemoving,
  t,
}: SuitabilityPillProps) {
  const color = suitability.subjectColor;

  // Use the subject's custom color if available, otherwise fall back to blue
  const style = color
    ? {
        backgroundColor: `${color}20`, // 20 is ~12% opacity in hex
        color: color,
      }
    : undefined;

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
        !color &&
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      )}
      style={style}
    >
      <span>{suitability.subjectName}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={isRemoving}
        className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
        aria-label={t("rooms.subjects.remove")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
