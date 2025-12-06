import { useState } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast, showSuccessToast } from "@/api";
import { useCreateAccessRequest } from "@/api/hooks/use-access-requests";
import type { SchoolRole } from "@/auth/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface AccessRequestFormProps {
  schoolId: string;
  onSuccess?: () => void;
}

const REQUESTABLE_ROLES: SchoolRole[] = ["VIEWER", "TEACHER", "PLANNER"];

/**
 * Form for requesting access to a school.
 */
export function AccessRequestForm({
  schoolId,
  onSuccess,
}: AccessRequestFormProps) {
  const { t } = useTranslation("auth");
  const [role, setRole] = useState<SchoolRole>("VIEWER");
  const [message, setMessage] = useState("");

  const createRequest = useCreateAccessRequest(schoolId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createRequest.mutateAsync({
        requestedRole: role,
        message: message || undefined,
      });
      showSuccessToast(t("accessRequestSent", "Access request sent"));
      onSuccess?.();
    } catch (error) {
      showErrorToast(error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="role">{t("requestedRole", "Requested Role")}</Label>
        <Select value={role} onValueChange={(v) => setRole(v as SchoolRole)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REQUESTABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">
          {t("message", "Message")} ({t("optional", "optional")})
        </Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(
            "accessRequestMessagePlaceholder",
            "Why do you need access to this school?",
          )}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={createRequest.isPending}>
        {createRequest.isPending
          ? t("sending", "Sending...")
          : t("requestAccess", "Request Access")}
      </Button>
    </form>
  );
}
