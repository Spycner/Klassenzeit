"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  LessonResponse,
  PatchLessonRequest,
  RoomResponse,
  TeacherResponse,
} from "@/lib/types";

interface Props {
  open: boolean;
  lesson: LessonResponse | null;
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  onClose: () => void;
  onSubmit: (changes: PatchLessonRequest) => void;
}

export function LessonEditDialog({
  open,
  lesson,
  teachers,
  rooms,
  onClose,
  onSubmit,
}: Props) {
  const t = useTranslations("timetable.edit");
  const [teacherId, setTeacherId] = useState<string>(lesson?.teacher_id ?? "");
  const [roomId, setRoomId] = useState<string>(lesson?.room_id ?? "");

  // Reset local state when the lesson being edited changes.
  useEffect(() => {
    setTeacherId(lesson?.teacher_id ?? "");
    setRoomId(lesson?.room_id ?? "");
  }, [lesson]);

  function handleApply() {
    if (!lesson) return;
    const changes: PatchLessonRequest = {};
    if (teacherId && teacherId !== lesson.teacher_id) {
      changes.teacher_id = teacherId;
    }
    const currentRoom = lesson.room_id ?? "";
    if (roomId !== currentRoom) {
      changes.room_id = roomId === "" ? null : roomId;
    }
    if (Object.keys(changes).length === 0) return;
    onSubmit(changes);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lesson-edit-teacher">Teacher</Label>
            <select
              id="lesson-edit-teacher"
              aria-label="Teacher"
              className="rounded border px-2 py-1"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              {teachers.map((tch) => (
                <option key={tch.id} value={tch.id}>
                  {tch.first_name} {tch.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lesson-edit-room">Room</Label>
            <select
              id="lesson-edit-room"
              aria-label="Room"
              className="rounded border px-2 py-1"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value="">{t("noRoom")}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleApply}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
