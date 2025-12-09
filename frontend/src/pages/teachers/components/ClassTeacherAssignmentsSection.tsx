import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type SchoolClassSummary,
  useClasses,
  useClassTeacherAssignments,
  useUpdateClass,
} from "@/api";
import { queryKeys } from "@/api/hooks/query-client";
import { LoadingState } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

interface ClassTeacherAssignmentsSectionProps {
  schoolId: string;
  teacherId: string;
}

export function ClassTeacherAssignmentsSection({
  schoolId,
  teacherId,
}: ClassTeacherAssignmentsSectionProps) {
  const { t, i18n } = useTranslation("pages");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const { data: assignedClasses, isLoading: assignedLoading } =
    useClassTeacherAssignments(schoolId, teacherId);
  const { data: allClasses, isLoading: allClassesLoading } =
    useClasses(schoolId);

  const updateClass = useUpdateClass(schoolId);

  const isLoading = assignedLoading || allClassesLoading;

  // Filter out classes that already have this teacher as class teacher
  // and show classes without a class teacher or with a different class teacher
  const availableClasses = useMemo(
    () =>
      allClasses?.filter(
        (c) =>
          c.isActive &&
          !assignedClasses?.some((assigned) => assigned.id === c.id),
      ) ?? [],
    [allClasses, assignedClasses],
  );

  const selectedClassName = useMemo(
    () => availableClasses.find((c) => c.id === selectedClassId)?.name ?? "",
    [availableClasses, selectedClassId],
  );

  const handleClassClick = (classId: string) => {
    navigate(`/${i18n.language}/classes/${classId}`);
  };

  const handleUnassign = async (classId: string) => {
    await updateClass.mutateAsync({
      id: classId,
      data: { clearClassTeacher: true },
    });
    // Invalidate the class teacher assignments query
    queryClient.invalidateQueries({
      queryKey: queryKeys.teachers.classTeacherAssignments(schoolId, teacherId),
    });
  };

  const handleAssign = async () => {
    if (!selectedClassId) return;

    await updateClass.mutateAsync({
      id: selectedClassId,
      data: { classTeacherId: teacherId },
    });
    // Invalidate the class teacher assignments query
    queryClient.invalidateQueries({
      queryKey: queryKeys.teachers.classTeacherAssignments(schoolId, teacherId),
    });
    resetForm();
  };

  const resetForm = () => {
    setSelectedClassId("");
    setSearchValue("");
    setIsAdding(false);
  };

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    setComboboxOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          {t("teachers.classTeacherAssignments.title")}
        </CardTitle>
        {!isAdding && availableClasses.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("teachers.classTeacherAssignments.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {/* Add class assignment form */}
            {isAdding && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <span className="text-sm font-medium">
                      {t("teachers.classTeacherAssignments.class")}
                    </span>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-expanded={comboboxOpen}
                          aria-label={t(
                            "teachers.classTeacherAssignments.class",
                          )}
                          className="w-full justify-between font-normal"
                        >
                          {selectedClassName ||
                            t("teachers.classTeacherAssignments.selectClass")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder={t(
                              "teachers.classTeacherAssignments.searchClass",
                            )}
                            value={searchValue}
                            onValueChange={setSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t(
                                "teachers.classTeacherAssignments.noClassesFound",
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {availableClasses
                                .filter((c) =>
                                  c.name
                                    .toLowerCase()
                                    .includes(searchValue.toLowerCase()),
                                )
                                .map((schoolClass) => (
                                  <CommandItem
                                    key={schoolClass.id}
                                    value={schoolClass.id}
                                    onSelect={() =>
                                      handleSelectClass(schoolClass.id!)
                                    }
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedClassId === schoolClass.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {schoolClass.name}
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {t(
                                        "teachers.classTeacherAssignments.grade",
                                        {
                                          level: schoolClass.gradeLevel,
                                        },
                                      )}
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

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAssign}
                    disabled={!selectedClassId || updateClass.isPending}
                  >
                    {updateClass.isPending
                      ? t("common:saving")
                      : t("teachers.classTeacherAssignments.add")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetForm}>
                    {t("common:cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* Assigned classes list */}
            {assignedClasses && assignedClasses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {assignedClasses.map((schoolClass) => (
                  <ClassPill
                    key={schoolClass.id}
                    schoolClass={schoolClass}
                    onClick={() => handleClassClick(schoolClass.id!)}
                    onUnassign={() => handleUnassign(schoolClass.id!)}
                    isUnassigning={updateClass.isPending}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              !isAdding && (
                <p className="text-sm text-muted-foreground">
                  {t("teachers.classTeacherAssignments.empty")}
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ClassPillProps {
  schoolClass: SchoolClassSummary;
  onClick: () => void;
  onUnassign: () => void;
  isUnassigning: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function ClassPill({
  schoolClass,
  onClick,
  onUnassign,
  isUnassigning,
  t,
}: ClassPillProps) {
  return (
    <div className="group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2"
      >
        <Users className="h-4 w-4 text-muted-foreground" />
        <span>{schoolClass.name}</span>
        <Badge variant="secondary" className="ml-1">
          {t("teachers.classTeacherAssignments.grade", {
            level: schoolClass.gradeLevel,
          })}
        </Badge>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUnassign();
        }}
        disabled={isUnassigning}
        className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
        aria-label={t("teachers.classTeacherAssignments.unassign")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
