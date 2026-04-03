"use client";

import { Plus, Trash2, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { MemberResponse, SchoolResponse } from "@/lib/types";

const ROLES = ["admin", "teacher", "viewer"] as const;
type Role = (typeof ROLES)[number];

export default function MembersPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const locale = useLocale();
  const t = useTranslations("members");
  const tc = useTranslations("common");

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add member dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("teacher");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Remove member dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberResponse | null>(
    null,
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<SchoolResponse>(`/api/schools/${schoolId}`),
      apiClient.get<MemberResponse[]>(`/api/schools/${schoolId}/members`),
    ])
      .then(([schoolData, membersData]) => {
        setSchool(schoolData);
        setMembers(membersData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : tc("errorLoadData"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient, schoolId, tc]);

  const fetchMembers = useCallback(() => {
    apiClient
      .get<MemberResponse[]>(`/api/schools/${schoolId}/members`)
      .then((data) => {
        setMembers(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : tc("errorLoadData"));
      });
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isAdmin = school?.role === "admin";

  async function handleAddMember() {
    if (!newEmail.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await apiClient.post(`/api/schools/${schoolId}/members`, {
        email: newEmail.trim(),
        role: newRole,
      });
      setAddDialogOpen(false);
      setNewEmail("");
      setNewRole("teacher");
      fetchMembers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : tc("errorSaveData"));
    } finally {
      setAdding(false);
    }
  }

  async function handleChangeRole(member: MemberResponse, role: Role) {
    try {
      await apiClient.put(
        `/api/schools/${schoolId}/members/${member.user_id}`,
        {
          role,
        },
      );
      fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("errorSaveData"));
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/members/${memberToRemove.user_id}`,
      );
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      fetchMembers();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : tc("errorSaveData"));
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", {
              name: school?.name ?? "",
              count: members.length,
            })}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setAddError(null);
                  setNewEmail("");
                  setNewRole("teacher");
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {t("add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("addTitle")}</DialogTitle>
                <DialogDescription>{t("addDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="member-email">{t("emailLabel")}</Label>
                  <Input
                    id="member-email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMember();
                    }}
                    disabled={adding}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="member-role">{t("roleLabel")}</Label>
                  <Select
                    value={newRole}
                    onValueChange={(value) => setNewRole(value as Role)}
                    disabled={adding}
                  >
                    <SelectTrigger id="member-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          <span className="capitalize">{role}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {addError && (
                  <p className="text-sm text-destructive">{addError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleAddMember}
                  disabled={!newEmail.trim() || adding}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {adding ? t("adding") : t("add")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("nameHeader")}</TableHead>
            <TableHead>{t("emailHeader")}</TableHead>
            <TableHead>{t("roleHeader")}</TableHead>
            <TableHead>{t("joinedHeader")}</TableHead>
            {isAdmin && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell className="font-medium">
                {member.display_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.email}
              </TableCell>
              <TableCell>
                {isAdmin ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      handleChangeRole(member, value as Role)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          <span className="capitalize">{role}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="capitalize">{member.role}</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(member.joined_at).toLocaleDateString(locale)}
              </TableCell>
              {isAdmin && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setMemberToRemove(member);
                      setRemoveError(null);
                      setRemoveDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">{t("removeLabel")}</span>
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {members.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={isAdmin ? 5 : 4}
                className="py-8 text-center text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
            <DialogDescription>
              {t.rich("removeConfirm", {
                name: memberToRemove?.display_name ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p className="text-sm text-destructive">{removeError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={removing}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={removing}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {removing ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
