import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SubjectRoomSummary,
  useAddRoomToSubject,
  useRemoveRoomFromSubject,
  useRooms,
  useSubjectRooms,
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

interface RoomAssignmentSectionProps {
  schoolId: string;
  subjectId: string;
}

export function RoomAssignmentSection({
  schoolId,
  subjectId,
}: RoomAssignmentSectionProps) {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: assignedRooms, isLoading: roomsAssignedLoading } =
    useSubjectRooms(schoolId, subjectId);
  const { data: allRooms, isLoading: allRoomsLoading } = useRooms(schoolId);

  const addMutation = useAddRoomToSubject(schoolId, subjectId);
  const removeMutation = useRemoveRoomFromSubject(schoolId, subjectId);

  const isLoading = roomsAssignedLoading || allRoomsLoading;
  const isSaving = addMutation.isPending;

  // Filter out rooms that are already assigned
  const availableRooms = useMemo(
    () =>
      allRooms?.filter(
        (room) => !assignedRooms?.some((r) => r.roomId === room.id),
      ) ?? [],
    [allRooms, assignedRooms],
  );

  // Get the selected room's name for display
  const selectedRoomName = useMemo(
    () => availableRooms.find((r) => r.id === selectedRoomId)?.name ?? "",
    [availableRooms, selectedRoomId],
  );

  const resetForm = () => {
    setSelectedRoomId("");
    setSearchValue("");
    setIsAdding(false);
  };

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setComboboxOpen(false);
  };

  const handleAdd = async () => {
    if (!selectedRoomId) return;

    await addMutation.mutateAsync({
      roomId: selectedRoomId,
    });

    resetForm();
  };

  const handleRemove = async (roomId: string) => {
    setRemovingId(roomId);
    try {
      await removeMutation.mutateAsync(roomId);
    } finally {
      setRemovingId(null);
    }
  };

  const canSubmit = selectedRoomId && !isSaving;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t("subjects.rooms.title")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subjects.rooms.description")}
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("subjects.rooms.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {/* Add room form */}
            {isAdding && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Room combobox */}
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <span className="text-sm font-medium">
                      {t("subjects.rooms.room")}
                    </span>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-expanded={comboboxOpen}
                          aria-label={t("subjects.rooms.room")}
                          className="w-full justify-between font-normal"
                        >
                          {selectedRoomName || t("subjects.rooms.selectRoom")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder={t("subjects.rooms.searchRoom")}
                            value={searchValue}
                            onValueChange={setSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t("subjects.rooms.noRoomsFound")}
                            </CommandEmpty>
                            <CommandGroup>
                              {availableRooms
                                .filter(
                                  (r) =>
                                    fuzzyMatch(r.name, searchValue) ||
                                    (r.building &&
                                      fuzzyMatch(r.building, searchValue)),
                                )
                                .map((room) => (
                                  <CommandItem
                                    key={room.id}
                                    value={room.id}
                                    onSelect={() => handleSelectRoom(room.id)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedRoomId === room.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {room.name}
                                    {room.building && (
                                      <span className="ml-2 text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground">
                                        ({room.building})
                                      </span>
                                    )}
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
                    {isSaving ? tc("saving") : t("subjects.rooms.add")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetForm}>
                    {tc("cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* Assigned rooms list */}
            {assignedRooms && assignedRooms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {assignedRooms.map((room) => (
                  <RoomPill
                    key={room.suitabilityId}
                    room={room}
                    onRemove={() => handleRemove(room.roomId)}
                    isRemoving={removingId === room.roomId}
                    t={t}
                  />
                ))}
              </div>
            ) : !isAdding ? (
              <p className="text-sm text-muted-foreground">
                {t("subjects.rooms.empty")}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RoomPillProps {
  room: SubjectRoomSummary;
  onRemove: () => void;
  isRemoving: boolean;
  t: (key: string) => string;
}

function RoomPill({ room, onRemove, isRemoving, t }: RoomPillProps) {
  return (
    <div className="group inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800 transition-all dark:bg-green-900/30 dark:text-green-300">
      <span>{room.roomName}</span>
      {room.building && (
        <span className="text-xs opacity-70">({room.building})</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={isRemoving}
        className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
        aria-label={t("subjects.rooms.remove")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
