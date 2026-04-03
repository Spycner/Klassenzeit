"use client";

import { LogOut, Plus, School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";
import type { SchoolResponse } from "@/lib/types";

export default function SchoolsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { selectSchool } = useSchool();
  const apiClient = useApiClient();

  const [schools, setSchools] = useState<SchoolResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiClient
      .get<SchoolResponse[]>("/api/schools")
      .then((data) => {
        setSchools(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load schools");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient]);

  async function handleCreateSchool() {
    if (!newSchoolName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await apiClient.post<SchoolResponse>("/api/schools", {
        name: newSchoolName.trim(),
      });
      setDialogOpen(false);
      setNewSchoolName("");
      selectSchool(created.id);
      router.push(`/schools/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create school");
    } finally {
      setCreating(false);
    }
  }

  function handleCardClick(school: SchoolResponse) {
    selectSchool(school.id);
    router.push(`/schools/${school.id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Schools</h1>
          <div className="flex items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create School
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a new school</DialogTitle>
                  <DialogDescription>
                    Enter a name for your school. You can change this later.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="school-name">School name</Label>
                    <Input
                      id="school-name"
                      placeholder="e.g. Greenwood High School"
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateSchool();
                      }}
                      disabled={creating}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateSchool}
                    disabled={!newSchoolName.trim() || creating}
                  >
                    {creating ? "Creating..." : "Create School"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </Button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading && (
          <p className="text-center text-muted-foreground">
            Loading schools...
          </p>
        )}

        {!loading && schools.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <School className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No schools yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first school to get started
            </p>
          </div>
        )}

        {!loading && schools.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {schools.map((school) => (
              <Card
                key={school.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => handleCardClick(school)}
              >
                <CardHeader>
                  <CardTitle>{school.name}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {school.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {school.role}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
