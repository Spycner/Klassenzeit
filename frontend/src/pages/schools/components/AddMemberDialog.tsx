import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type SchoolRole, useCreateMembership, useUserSearch } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SCHOOL_ROLES: SchoolRole[] = [
  "SCHOOL_ADMIN",
  "PLANNER",
  "TEACHER",
  "VIEWER",
];

interface AddMemberDialogProps {
  schoolId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({
  schoolId,
  open,
  onOpenChange,
}: AddMemberDialogProps) {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");

  const [email, setEmail] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [role, setRole] = useState<SchoolRole>("VIEWER");

  // Debounce email input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [email]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setEmail("");
      setDebouncedEmail("");
      setSelectedUserId(null);
      setSelectedUserName(null);
      setRole("VIEWER");
    }
  }, [open]);

  const {
    data: user,
    isLoading: isSearching,
    isFetched,
  } = useUserSearch(debouncedEmail);

  const createMutation = useCreateMembership(schoolId);

  const handleSelectUser = () => {
    if (user) {
      setSelectedUserId(user.id);
      setSelectedUserName(user.displayName);
      setEmail("");
    }
  };

  const handleClearUser = () => {
    setSelectedUserId(null);
    setSelectedUserName(null);
    setEmail("");
    setDebouncedEmail("");
  };

  const handleSubmit = async () => {
    if (!selectedUserId) return;

    await createMutation.mutateAsync({
      userId: selectedUserId,
      role,
    });

    onOpenChange(false);
  };

  const showNotFound = isFetched && !user && debouncedEmail.length >= 3;
  const showUserFound = user && !selectedUserId;
  const canSubmit = selectedUserId && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("schools.members.add")}</DialogTitle>
          <DialogDescription>
            {t("schools.members.addDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* User Selection */}
          <div className="space-y-2">
            <Label htmlFor="email">{t("schools.members.columns.email")}</Label>

            {selectedUserId && selectedUserName ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <div className="flex-1">
                  <p className="font-medium">{selectedUserName}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearUser}
                >
                  {t("schools.form.admin.change")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("schools.form.admin.searchPlaceholder")}
                    className="flex-1"
                  />
                  {showUserFound && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSelectUser}
                    >
                      {t("schools.form.admin.select")}
                    </Button>
                  )}
                </div>

                {isSearching && debouncedEmail.length >= 3 && (
                  <p className="text-sm text-muted-foreground">
                    {t("schools.form.admin.searching")}
                  </p>
                )}

                {showUserFound && (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                )}

                {showNotFound && (
                  <p className="text-sm text-destructive">
                    {t("schools.form.admin.notFound")}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">{t("schools.members.columns.role")}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as SchoolRole)}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`schools.members.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createMutation.isPending
              ? tc("saving")
              : t("schools.members.addDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
