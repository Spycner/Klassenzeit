"use client";

import { Pencil } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolResponse } from "@/lib/types";

export default function SchoolDashboardPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const locale = useLocale();
  const t = useTranslations("school");
  const tc = useTranslations("common");

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSchool = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<SchoolResponse>(`/api/schools/${schoolId}`)
      .then((data) => {
        setSchool(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : tc("errorLoadData"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchSchool();
  }, [fetchSchool]);

  async function handleSaveName() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await apiClient.put<SchoolResponse>(
        `/api/schools/${schoolId}`,
        { name: newName.trim() },
      );
      setSchool(updated);
      setDialogOpen(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = school?.role === "admin";

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
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!school) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{school.name}</h1>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewName(school.name)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {tc("edit")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("editTitle")}</DialogTitle>
                <DialogDescription>{t("editDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="school-name">{t("name")}</Label>
                  <Input
                    id="school-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                    }}
                    disabled={saving}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSaveName}
                  disabled={!newName.trim() || saving}
                >
                  {saving ? tc("saving") : tc("save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("name")}
            </span>
            <span className="text-sm">{school.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("slug")}
            </span>
            <span className="font-mono text-sm">{school.slug}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("role")}
            </span>
            <span className="text-sm capitalize">{school.role}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("created")}
            </span>
            <span className="text-sm">
              {new Date(school.created_at).toLocaleDateString(locale)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
