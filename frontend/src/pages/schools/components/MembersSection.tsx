import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type MembershipSummary,
  type SchoolRole,
  useDeleteMembership,
  useMemberships,
  useUpdateMembership,
} from "@/api";
import {
  type Column,
  ConfirmDialog,
  DataTable,
  LoadingState,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MembersSectionProps {
  schoolId: string;
}

const SCHOOL_ROLES: SchoolRole[] = [
  "SCHOOL_ADMIN",
  "PLANNER",
  "TEACHER",
  "VIEWER",
];

function getRoleBadgeVariant(
  role: SchoolRole,
): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "SCHOOL_ADMIN":
      return "default";
    case "PLANNER":
      return "secondary";
    case "TEACHER":
      return "outline";
    case "VIEWER":
      return "outline";
    default:
      return "outline";
  }
}

export function MembersSection({ schoolId }: MembersSectionProps) {
  const { t } = useTranslation("pages");

  const [memberToDelete, setMemberToDelete] =
    useState<MembershipSummary | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const { data: members, isLoading } = useMemberships(schoolId);
  const updateMutation = useUpdateMembership(schoolId);
  const deleteMutation = useDeleteMembership(schoolId);

  const handleRoleChange = async (memberId: string, newRole: SchoolRole) => {
    await updateMutation.mutateAsync({
      id: memberId,
      data: { role: newRole },
    });
    setEditingMemberId(null);
  };

  const handleDelete = async () => {
    if (memberToDelete) {
      await deleteMutation.mutateAsync(memberToDelete.id);
      setMemberToDelete(null);
    }
  };

  const columns: Column<MembershipSummary>[] = [
    {
      key: "userDisplayName",
      header: t("schools.members.columns.name"),
      sortable: true,
    },
    {
      key: "userEmail",
      header: t("schools.members.columns.email"),
      sortable: true,
    },
    {
      key: "role",
      header: t("schools.members.columns.role"),
      cell: (row) => {
        if (editingMemberId === row.id) {
          return (
            <Select
              value={row.role}
              onValueChange={(value) =>
                handleRoleChange(row.id, value as SchoolRole)
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`schools.members.roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Badge
            variant={getRoleBadgeVariant(row.role)}
            className="cursor-pointer"
            onClick={() => setEditingMemberId(row.id)}
          >
            {t(`schools.members.roles.${row.role}`)}
          </Badge>
        );
      },
      sortable: true,
    },
    {
      key: "isActive",
      header: t("schools.members.columns.status"),
      cell: (row) => (
        <Badge variant={row.isActive ? "outline" : "secondary"}>
          {row.isActive
            ? t("schools.members.status.active")
            : t("schools.members.status.inactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setMemberToDelete(row);
          }}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t("schools.members.title")}</CardTitle>
        <Button variant="outline" size="sm" disabled>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("schools.members.add")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : !members || members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("schools.members.empty")}
          </p>
        ) : (
          <DataTable
            data={members}
            columns={columns}
            keyField="id"
            defaultSort={{ key: "userDisplayName", direction: "asc" }}
          />
        )}
      </CardContent>

      <ConfirmDialog
        open={!!memberToDelete}
        onOpenChange={(open) => !open && setMemberToDelete(null)}
        title={t("schools.members.confirmDelete.title")}
        description={t("schools.members.confirmDelete.description", {
          name: memberToDelete?.userDisplayName,
        })}
        confirmLabel={t("schools.members.remove")}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </Card>
  );
}
