import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  type CreateRoomInput,
  createRoomSchema,
  type RoomResponse,
  validate,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RoomFormData = CreateRoomInput;

interface RoomFormProps {
  room?: RoomResponse;
  onSubmit: (data: RoomFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function RoomForm({ room, onSubmit, isSubmitting }: RoomFormProps) {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [name, setName] = useState(room?.name ?? "");
  const [building, setBuilding] = useState(room?.building ?? "");
  const [capacity, setCapacity] = useState<string>(
    room?.capacity?.toString() ?? "",
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const formData = {
      name: name.trim(),
      building: building.trim() || undefined,
      capacity: capacity ? Number.parseInt(capacity, 10) : undefined,
    };
    const result = validate(createRoomSchema, formData);
    if (!result.success) return;
    await onSubmit(result.data);
  };

  const handleCancel = () => {
    navigate(`/${i18n.language}/rooms`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("rooms.form.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={50}
                placeholder={t("rooms.form.namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="building">{t("rooms.form.building")}</Label>
              <Input
                id="building"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                maxLength={100}
                placeholder={t("rooms.form.buildingPlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="capacity">{t("rooms.form.capacity")}</Label>
              <Input
                id="capacity"
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                min={1}
                placeholder={t("rooms.form.capacityPlaceholder")}
              />
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
                : room
                  ? tc("save")
                  : t("rooms.form.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
