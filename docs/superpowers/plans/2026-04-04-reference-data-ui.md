# Reference Data Management UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only Settings page with tabbed CRUD management for Terms, Classes, Subjects, Teachers, Rooms, and Timeslots.

**Architecture:** Single `/schools/[id]/settings` route with a horizontal tab strip. Each tab is a self-contained component that fetches, displays, creates, edits, and deletes its entity via the existing REST API. A small backend endpoint is added for listing school years (needed by the Terms form).

**Tech Stack:** Next.js 16 (App Router), React 19, shadcn/Radix UI components, next-intl, Tailwind CSS 4, sonner toasts, Loco/Rust backend.

---

## File Structure

### Backend (new)
- `backend/src/controllers/school_years.rs` — list-only endpoint for school years

### Frontend (new)
- `frontend/src/app/[locale]/schools/[id]/settings/page.tsx` — main page with tabs + admin guard
- `frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx`

### Frontend (modified)
- `frontend/src/lib/types.ts` — update existing types, add `SchoolYearResponse`
- `frontend/src/messages/en.json` — add `settings` namespace
- `frontend/src/messages/de.json` — add `settings` namespace
- `frontend/src/app/[locale]/schools/[id]/layout.tsx` — add Settings sidebar item (admin-only)

---

## Task 1: Backend — School Years List Endpoint

**Files:**
- Create: `backend/src/controllers/school_years.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Create school_years controller with list endpoint**

```rust
// backend/src/controllers/school_years.rs
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::school_years;

#[derive(Debug, Serialize)]
struct SchoolYearResponse {
    id: String,
    name: String,
    start_date: String,
    end_date: String,
    is_current: bool,
}

impl SchoolYearResponse {
    fn from_model(m: &school_years::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            start_date: m.start_date.to_string(),
            end_date: m.end_date.to_string(),
            is_current: m.is_current,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = school_years::Entity::find()
        .filter(school_years::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SchoolYearResponse> = items.iter().map(SchoolYearResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/school-years")
        .add("/", get(list))
}
```

- [ ] **Step 2: Register the controller**

Add to `backend/src/controllers/mod.rs`:
```rust
pub mod school_years;
```

Add to `backend/src/app.rs` in the `routes()` method:
```rust
.add_route(controllers::school_years::routes())
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --workspace`
Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/school_years.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat: add school years list endpoint"
```

---

## Task 2: Frontend — Update Types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Update existing types and add SchoolYearResponse**

The existing frontend types are missing fields that the backend returns. Update `frontend/src/lib/types.ts`:

Add `SchoolYearResponse`:
```typescript
export interface SchoolYearResponse {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}
```

Update `TermResponse` to include `school_year_id`:
```typescript
export interface TermResponse {
  id: string;
  school_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}
```

Update `TeacherResponse` to include all fields from the backend:
```typescript
export interface TeacherResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  abbreviation: string;
  max_hours_per_week: number;
  is_part_time: boolean;
  is_active: boolean;
}
```

Update `SchoolClassResponse` to include all fields:
```typescript
export interface SchoolClassResponse {
  id: string;
  name: string;
  grade_level: number;
  student_count: number | null;
  class_teacher_id: string | null;
  is_active: boolean;
}
```

Update `RoomResponse` to include `is_active`:
```typescript
export interface RoomResponse {
  id: string;
  name: string;
  building: string | null;
  capacity: number | null;
  is_active: boolean;
}
```

`SubjectResponse` and `TimeSlotResponse` are already correct.

- [ ] **Step 2: Verify no type errors introduced**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (existing code uses a subset of these fields, so adding fields is non-breaking).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: update frontend types to match backend responses"
```

---

## Task 3: Frontend — i18n Translations

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add settings namespace to en.json**

Add the following `"settings"` key at the top level of `frontend/src/messages/en.json`:

```json
"settings": {
  "title": "Settings",
  "subtitle": "Manage school reference data",
  "accessDenied": "You need admin access to view this page.",
  "tabs": {
    "terms": "Terms",
    "classes": "Classes",
    "subjects": "Subjects",
    "teachers": "Teachers",
    "rooms": "Rooms",
    "timeslots": "Timeslots"
  },
  "terms": {
    "addTitle": "Add Term",
    "editTitle": "Edit Term",
    "name": "Name",
    "namePlaceholder": "e.g. Fall Semester",
    "schoolYear": "School Year",
    "selectSchoolYear": "Select school year",
    "startDate": "Start Date",
    "endDate": "End Date",
    "isCurrent": "Current term",
    "currentBadge": "Current",
    "empty": "No terms yet.",
    "saved": "Term saved",
    "deleted": "Term deleted",
    "deleteConfirm": "This will permanently delete the term \"{name}\". This cannot be undone.",
    "deleteConflict": "Cannot delete — term is still referenced by other records."
  },
  "classes": {
    "addTitle": "Add Class",
    "editTitle": "Edit Class",
    "name": "Name",
    "namePlaceholder": "e.g. 10A",
    "gradeLevel": "Grade Level",
    "studentCount": "Students",
    "classTeacher": "Class Teacher",
    "selectTeacher": "Select teacher (optional)",
    "noTeacher": "None",
    "empty": "No classes yet.",
    "saved": "Class saved",
    "deleted": "Class deactivated",
    "deleteConfirm": "This will deactivate the class \"{name}\". It can be restored later."
  },
  "subjects": {
    "addTitle": "Add Subject",
    "editTitle": "Edit Subject",
    "name": "Name",
    "namePlaceholder": "e.g. Mathematics",
    "abbreviation": "Abbreviation",
    "abbreviationPlaceholder": "e.g. MA",
    "color": "Color",
    "needsSpecialRoom": "Needs special room",
    "specialRoomBadge": "Special Room",
    "empty": "No subjects yet.",
    "saved": "Subject saved",
    "deleted": "Subject deleted",
    "deleteConfirm": "This will permanently delete the subject \"{name}\". This cannot be undone.",
    "deleteConflict": "Cannot delete — subject is still referenced by other records."
  },
  "teachers": {
    "addTitle": "Add Teacher",
    "editTitle": "Edit Teacher",
    "firstName": "First Name",
    "firstNamePlaceholder": "e.g. John",
    "lastName": "Last Name",
    "lastNamePlaceholder": "e.g. Smith",
    "abbreviation": "Abbreviation",
    "abbreviationPlaceholder": "e.g. JS",
    "email": "Email",
    "emailPlaceholder": "e.g. john@school.de",
    "maxHours": "Max Hours/Week",
    "isPartTime": "Part-time",
    "partTimeBadge": "Part-time",
    "empty": "No teachers yet.",
    "saved": "Teacher saved",
    "deleted": "Teacher deactivated",
    "deleteConfirm": "This will deactivate the teacher \"{name}\". It can be restored later."
  },
  "rooms": {
    "addTitle": "Add Room",
    "editTitle": "Edit Room",
    "name": "Name",
    "namePlaceholder": "e.g. A101",
    "building": "Building",
    "buildingPlaceholder": "e.g. Building A",
    "capacity": "Capacity",
    "empty": "No rooms yet.",
    "saved": "Room saved",
    "deleted": "Room deactivated",
    "deleteConfirm": "This will deactivate the room \"{name}\". It can be restored later."
  },
  "timeslots": {
    "addTitle": "Add Timeslot",
    "editTitle": "Edit Timeslot",
    "day": "Day",
    "period": "Period",
    "startTime": "Start Time",
    "endTime": "End Time",
    "isBreak": "Break",
    "breakBadge": "Break",
    "label": "Label",
    "labelPlaceholder": "e.g. 1st Period",
    "empty": "No timeslots yet.",
    "saved": "Timeslot saved",
    "deleted": "Timeslot deleted",
    "deleteConfirm": "This will permanently delete this timeslot. This cannot be undone.",
    "deleteConflict": "Cannot delete — timeslot is still referenced by other records.",
    "days": {
      "0": "Monday",
      "1": "Tuesday",
      "2": "Wednesday",
      "3": "Thursday",
      "4": "Friday",
      "5": "Saturday"
    }
  },
  "actions": {
    "add": "Add {entity}",
    "deleteTitle": "Confirm Delete"
  }
}
```

- [ ] **Step 2: Add settings namespace to de.json**

Add the following `"settings"` key at the top level of `frontend/src/messages/de.json`:

```json
"settings": {
  "title": "Einstellungen",
  "subtitle": "Stammdaten der Schule verwalten",
  "accessDenied": "Du benötigst Administratorzugriff, um diese Seite anzuzeigen.",
  "tabs": {
    "terms": "Halbjahre",
    "classes": "Klassen",
    "subjects": "Fächer",
    "teachers": "Lehrkräfte",
    "rooms": "Räume",
    "timeslots": "Zeitraster"
  },
  "terms": {
    "addTitle": "Halbjahr hinzufügen",
    "editTitle": "Halbjahr bearbeiten",
    "name": "Name",
    "namePlaceholder": "z.B. Herbstsemester",
    "schoolYear": "Schuljahr",
    "selectSchoolYear": "Schuljahr auswählen",
    "startDate": "Startdatum",
    "endDate": "Enddatum",
    "isCurrent": "Aktuelles Halbjahr",
    "currentBadge": "Aktuell",
    "empty": "Noch keine Halbjahre.",
    "saved": "Halbjahr gespeichert",
    "deleted": "Halbjahr gelöscht",
    "deleteConfirm": "Das Halbjahr \"{name}\" wird dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
    "deleteConflict": "Löschen nicht möglich — Halbjahr wird noch von anderen Datensätzen referenziert."
  },
  "classes": {
    "addTitle": "Klasse hinzufügen",
    "editTitle": "Klasse bearbeiten",
    "name": "Name",
    "namePlaceholder": "z.B. 10A",
    "gradeLevel": "Klassenstufe",
    "studentCount": "Schüler",
    "classTeacher": "Klassenleitung",
    "selectTeacher": "Lehrkraft auswählen (optional)",
    "noTeacher": "Keine",
    "empty": "Noch keine Klassen.",
    "saved": "Klasse gespeichert",
    "deleted": "Klasse deaktiviert",
    "deleteConfirm": "Die Klasse \"{name}\" wird deaktiviert. Sie kann später wiederhergestellt werden."
  },
  "subjects": {
    "addTitle": "Fach hinzufügen",
    "editTitle": "Fach bearbeiten",
    "name": "Name",
    "namePlaceholder": "z.B. Mathematik",
    "abbreviation": "Kürzel",
    "abbreviationPlaceholder": "z.B. MA",
    "color": "Farbe",
    "needsSpecialRoom": "Benötigt Fachraum",
    "specialRoomBadge": "Fachraum",
    "empty": "Noch keine Fächer.",
    "saved": "Fach gespeichert",
    "deleted": "Fach gelöscht",
    "deleteConfirm": "Das Fach \"{name}\" wird dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
    "deleteConflict": "Löschen nicht möglich — Fach wird noch von anderen Datensätzen referenziert."
  },
  "teachers": {
    "addTitle": "Lehrkraft hinzufügen",
    "editTitle": "Lehrkraft bearbeiten",
    "firstName": "Vorname",
    "firstNamePlaceholder": "z.B. Max",
    "lastName": "Nachname",
    "lastNamePlaceholder": "z.B. Müller",
    "abbreviation": "Kürzel",
    "abbreviationPlaceholder": "z.B. MÜ",
    "email": "E-Mail",
    "emailPlaceholder": "z.B. max@schule.de",
    "maxHours": "Max. Stunden/Woche",
    "isPartTime": "Teilzeit",
    "partTimeBadge": "Teilzeit",
    "empty": "Noch keine Lehrkräfte.",
    "saved": "Lehrkraft gespeichert",
    "deleted": "Lehrkraft deaktiviert",
    "deleteConfirm": "Die Lehrkraft \"{name}\" wird deaktiviert. Sie kann später wiederhergestellt werden."
  },
  "rooms": {
    "addTitle": "Raum hinzufügen",
    "editTitle": "Raum bearbeiten",
    "name": "Name",
    "namePlaceholder": "z.B. A101",
    "building": "Gebäude",
    "buildingPlaceholder": "z.B. Hauptgebäude",
    "capacity": "Kapazität",
    "empty": "Noch keine Räume.",
    "saved": "Raum gespeichert",
    "deleted": "Raum deaktiviert",
    "deleteConfirm": "Der Raum \"{name}\" wird deaktiviert. Er kann später wiederhergestellt werden."
  },
  "timeslots": {
    "addTitle": "Zeitraster hinzufügen",
    "editTitle": "Zeitraster bearbeiten",
    "day": "Tag",
    "period": "Stunde",
    "startTime": "Beginn",
    "endTime": "Ende",
    "isBreak": "Pause",
    "breakBadge": "Pause",
    "label": "Bezeichnung",
    "labelPlaceholder": "z.B. 1. Stunde",
    "empty": "Noch kein Zeitraster.",
    "saved": "Zeitraster gespeichert",
    "deleted": "Zeitraster gelöscht",
    "deleteConfirm": "Dieses Zeitraster wird dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
    "deleteConflict": "Löschen nicht möglich — Zeitraster wird noch von anderen Datensätzen referenziert.",
    "days": {
      "0": "Montag",
      "1": "Dienstag",
      "2": "Mittwoch",
      "3": "Donnerstag",
      "4": "Freitag",
      "5": "Samstag"
    }
  },
  "actions": {
    "add": "{entity} hinzufügen",
    "deleteTitle": "Löschen bestätigen"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "feat: add settings i18n translations (DE/EN)"
```

---

## Task 4: Frontend — Settings Page Shell + Sidebar

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx`

- [ ] **Step 1: Create the settings page with tab navigation and admin guard**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/page.tsx
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolResponse } from "@/lib/types";

const TABS = ["terms", "classes", "subjects", "teachers", "rooms", "timeslots"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const apiClient = useApiClient();
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "terms";

  const setActiveTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    apiClient
      .get<SchoolResponse>(`/api/schools/${schoolId}`)
      .then(setSchool)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiClient, schoolId]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  if (school?.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div>
        {/* Tab content rendered here — placeholder until tab components are built */}
        <p className="text-muted-foreground">Tab: {activeTab}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Settings to sidebar (admin-only)**

In `frontend/src/app/[locale]/schools/[id]/layout.tsx`:

Add `Settings` import:
```typescript
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
```

Add state for school data and fetch it. Then add the Settings nav item conditionally:

After the existing `navItems` array, add:
```typescript
const [school, setSchool] = useState<SchoolResponse | null>(null);

useEffect(() => {
  apiClient
    .get<SchoolResponse>(`/api/schools/${schoolId}`)
    .then(setSchool)
    .catch(() => {});
}, [apiClient, schoolId]);

const isAdmin = school?.role === "admin";
```

Add to the `navItems` array conditionally — or better, build the items list and conditionally include Settings:

Replace the `navItems` const with:
```typescript
const navItems = [
  {
    title: t("dashboard"),
    href: `/${locale}/schools/${schoolId}`,
    icon: LayoutDashboard,
  },
  {
    title: t("members"),
    href: `/${locale}/schools/${schoolId}/members`,
    icon: Users,
  },
  {
    title: tCurriculum("title"),
    href: `/${locale}/schools/${schoolId}/curriculum`,
    icon: BookOpen,
  },
  {
    title: tScheduler("title"),
    href: `/${locale}/schools/${schoolId}/schedule`,
    icon: Calendar,
  },
  ...(isAdmin
    ? [
        {
          title: tSettings("title"),
          href: `/${locale}/schools/${schoolId}/settings`,
          icon: Settings,
        },
      ]
    : []),
];
```

Add imports/hooks needed:
```typescript
const tSettings = useTranslations("settings");
const apiClient = useApiClient();
const [school, setSchool] = useState<SchoolResponse | null>(null);
```

Add the fetch effect:
```typescript
useEffect(() => {
  apiClient
    .get<SchoolResponse>(`/api/schools/${schoolId}`)
    .then(setSchool)
    .catch(() => {});
}, [apiClient, schoolId]);

const isAdmin = school?.role === "admin";
```

Add required imports:
```typescript
import { useState } from "react"; // add to existing import
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolResponse } from "@/lib/types";
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/page.tsx frontend/src/app/[locale]/schools/[id]/layout.tsx
git commit -m "feat: add settings page shell with tabs and sidebar entry"
```

---

## Task 5: Frontend — Teachers Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

This task implements one complete tab as the reference pattern. All subsequent tabs follow this pattern.

- [ ] **Step 1: Create the teachers tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { TeacherResponse } from "@/lib/types";

export function TeachersTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.teachers");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<TeacherResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TeacherResponse | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [email, setEmail] = useState("");
  const [maxHours, setMaxHours] = useState(28);
  const [isPartTime, setIsPartTime] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TeacherResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setFirstName("");
    setLastName("");
    setAbbreviation("");
    setEmail("");
    setMaxHours(28);
    setIsPartTime(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: TeacherResponse) {
    setEditingItem(item);
    setFirstName(item.first_name);
    setLastName(item.last_name);
    setAbbreviation(item.abbreviation);
    setEmail(item.email ?? "");
    setMaxHours(item.max_hours_per_week);
    setIsPartTime(item.is_part_time);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !abbreviation.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        abbreviation: abbreviation.trim(),
        email: email.trim() || null,
        max_hours_per_week: maxHours,
        is_part_time: isPartTime,
      };
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/teachers/${editingItem.id}`, body);
      } else {
        await apiClient.post(`/api/schools/${schoolId}/teachers`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/teachers/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {ta("add", { entity: t("addTitle").replace(/^Add /, "") })}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("abbreviation")}</TableHead>
            <TableHead>{t("firstName")}</TableHead>
            <TableHead>{t("lastName")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("maxHours")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.abbreviation}</TableCell>
              <TableCell>{item.first_name}</TableCell>
              <TableCell>{item.last_name}</TableCell>
              <TableCell className="text-muted-foreground">{item.email ?? "—"}</TableCell>
              <TableCell>
                {item.max_hours_per_week}
                {item.is_part_time && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{t("partTimeBadge")}</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("firstName")}</Label>
                <Input
                  placeholder={t("firstNamePlaceholder")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("lastName")}</Label>
                <Input
                  placeholder={t("lastNamePlaceholder")}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("abbreviation")}</Label>
                <Input
                  placeholder={t("abbreviationPlaceholder")}
                  value={abbreviation}
                  onChange={(e) => setAbbreviation(e.target.value)}
                  maxLength={5}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("email")}</Label>
                <Input
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("maxHours")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={maxHours}
                  onChange={(e) => setMaxHours(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  id="is-part-time"
                  checked={isPartTime}
                  onChange={(e) => setIsPartTime(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4"
                />
                <Label htmlFor="is-part-time">{t("isPartTime")}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!firstName.trim() || !lastName.trim() || !abbreviation.trim() || saving}
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: `${itemToDelete?.first_name ?? ""} ${itemToDelete?.last_name ?? ""}` })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up teachers tab in settings page**

In `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`, replace the placeholder tab content:

Add import:
```typescript
import { TeachersTab } from "./components/teachers-tab";
```

Replace the placeholder `<p>` with:
```tsx
<div>
  {activeTab === "teachers" && <TeachersTab />}
  {activeTab !== "teachers" && (
    <p className="text-muted-foreground">Tab: {activeTab}</p>
  )}
</div>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add teachers tab with full CRUD"
```

---

## Task 6: Frontend — Subjects Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Create the subjects tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { SubjectResponse } from "@/lib/types";

export function SubjectsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.subjects");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<SubjectResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubjectResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [color, setColor] = useState("");
  const [needsSpecialRoom, setNeedsSpecialRoom] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SubjectResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setAbbreviation("");
    setColor("");
    setNeedsSpecialRoom(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: SubjectResponse) {
    setEditingItem(item);
    setName(item.name);
    setAbbreviation(item.abbreviation);
    setColor(item.color ?? "");
    setNeedsSpecialRoom(item.needs_special_room);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !abbreviation.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        abbreviation: abbreviation.trim(),
        color: color.trim() || null,
        needs_special_room: needsSpecialRoom,
      };
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/subjects/${editingItem.id}`, body);
      } else {
        await apiClient.post(`/api/schools/${schoolId}/subjects`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/subjects/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409") || msg.includes("conflict") || msg.includes("referenced")) {
        toast.error(t("deleteConflict"));
      } else {
        toast.error(tc("errorSaveData"));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("abbreviation")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("color")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.abbreviation}</TableCell>
              <TableCell>
                {item.name}
                {item.needs_special_room && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{t("specialRoomBadge")}</span>
                )}
              </TableCell>
              <TableCell>
                {item.color ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-muted-foreground">{item.color}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("abbreviation")}</Label>
                <Input
                  placeholder={t("abbreviationPlaceholder")}
                  value={abbreviation}
                  onChange={(e) => setAbbreviation(e.target.value)}
                  maxLength={10}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("color")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={color || "#000000"}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={saving}
                    className="h-9 w-12 p-1"
                  />
                  <Input
                    placeholder="#FF0000"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={saving}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="needs-special-room"
                checked={needsSpecialRoom}
                onChange={(e) => setNeedsSpecialRoom(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="needs-special-room">{t("needsSpecialRoom")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || !abbreviation.trim() || saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: itemToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up subjects tab in settings page**

Add import and render condition in `page.tsx`:
```typescript
import { SubjectsTab } from "./components/subjects-tab";
```

Update the tab content area to include:
```tsx
{activeTab === "subjects" && <SubjectsTab />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add subjects tab with full CRUD"
```

---

## Task 7: Frontend — Rooms Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Create the rooms tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { RoomResponse } from "@/lib/types";

export function RoomsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.rooms");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoomResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [building, setBuilding] = useState("");
  const [capacity, setCapacity] = useState<number | "">("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<RoomResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setBuilding("");
    setCapacity("");
    setDialogOpen(true);
  }

  function openEditDialog(item: RoomResponse) {
    setEditingItem(item);
    setName(item.name);
    setBuilding(item.building ?? "");
    setCapacity(item.capacity ?? "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        building: building.trim() || null,
        capacity: capacity === "" ? null : Number(capacity),
      };
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/rooms/${editingItem.id}`, body);
      } else {
        await apiClient.post(`/api/schools/${schoolId}/rooms`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/rooms/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("building")}</TableHead>
            <TableHead>{t("capacity")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{item.building ?? "—"}</TableCell>
              <TableCell>{item.capacity ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("building")}</Label>
                <Input
                  placeholder={t("buildingPlaceholder")}
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("capacity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: itemToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up rooms tab in settings page**

Add import and render condition:
```typescript
import { RoomsTab } from "./components/rooms-tab";
```
```tsx
{activeTab === "rooms" && <RoomsTab />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add rooms tab with full CRUD"
```

---

## Task 8: Frontend — Classes Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Create the classes tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolClassResponse, TeacherResponse } from "@/lib/types";

const NO_TEACHER = "__none__";

export function ClassesTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.classes");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<SchoolClassResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SchoolClassResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState(1);
  const [studentCount, setStudentCount] = useState<number | "">("");
  const [classTeacherId, setClassTeacherId] = useState(NO_TEACHER);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SchoolClassResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
    ])
      .then(([classesData, teachersData]) => {
        setItems(classesData);
        setTeachers(teachersData);
      })
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const teacherName = (id: string | null) => {
    if (!id) return "—";
    const teacher = teachers.find((t) => t.id === id);
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : "—";
  };

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setGradeLevel(1);
    setStudentCount("");
    setClassTeacherId(NO_TEACHER);
    setDialogOpen(true);
  }

  function openEditDialog(item: SchoolClassResponse) {
    setEditingItem(item);
    setName(item.name);
    setGradeLevel(item.grade_level);
    setStudentCount(item.student_count ?? "");
    setClassTeacherId(item.class_teacher_id ?? NO_TEACHER);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        grade_level: gradeLevel,
        student_count: studentCount === "" ? null : Number(studentCount),
        class_teacher_id: classTeacherId === NO_TEACHER ? null : classTeacherId,
      };
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/classes/${editingItem.id}`, body);
      } else {
        await apiClient.post(`/api/schools/${schoolId}/classes`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/classes/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("gradeLevel")}</TableHead>
            <TableHead>{t("studentCount")}</TableHead>
            <TableHead>{t("classTeacher")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.grade_level}</TableCell>
              <TableCell>{item.student_count ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{teacherName(item.class_teacher_id)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("name")}</Label>
                <Input
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("gradeLevel")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={13}
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("studentCount")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={studentCount}
                  onChange={(e) => setStudentCount(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("classTeacher")}</Label>
                <Select value={classTeacherId} onValueChange={setClassTeacherId} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectTeacher")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>{t("noTeacher")}</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: itemToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up classes tab in settings page**

Add import and render condition:
```typescript
import { ClassesTab } from "./components/classes-tab";
```
```tsx
{activeTab === "classes" && <ClassesTab />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add classes tab with full CRUD"
```

---

## Task 9: Frontend — Terms Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Create the terms tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolYearResponse, TermResponse } from "@/lib/types";

export function TermsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const locale = useLocale();
  const t = useTranslations("settings.terms");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<TermResponse[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TermResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [schoolYearId, setSchoolYearId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TermResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolYearResponse[]>(`/api/schools/${schoolId}/school-years`),
    ])
      .then(([termsData, schoolYearsData]) => {
        setItems(termsData);
        setSchoolYears(schoolYearsData);
      })
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setSchoolYearId(schoolYears.length > 0 ? schoolYears[0].id : "");
    setStartDate("");
    setEndDate("");
    setIsCurrent(false);
    setDialogOpen(true);
  }

  function openEditDialog(item: TermResponse) {
    setEditingItem(item);
    setName(item.name);
    setSchoolYearId(item.school_year_id);
    setStartDate(item.start_date);
    setEndDate(item.end_date);
    setIsCurrent(item.is_current);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !schoolYearId || !startDate || !endDate || saving) return;
    setSaving(true);
    try {
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/terms/${editingItem.id}`, {
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_current: isCurrent,
        });
      } else {
        await apiClient.post(`/api/schools/${schoolId}/terms`, {
          school_year_id: schoolYearId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          is_current: isCurrent,
        });
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/terms/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409") || msg.includes("conflict") || msg.includes("referenced")) {
        toast.error(t("deleteConflict"));
      } else {
        toast.error(tc("errorSaveData"));
      }
    } finally {
      setDeleting(false);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(locale);
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("startDate")}</TableHead>
            <TableHead>{t("endDate")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                {item.name}
                {item.is_current && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {t("currentBadge")}
                  </span>
                )}
              </TableCell>
              <TableCell>{formatDate(item.start_date)}</TableCell>
              <TableCell>{formatDate(item.end_date)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            {!editingItem && (
              <div className="grid gap-2">
                <Label>{t("schoolYear")}</Label>
                <Select value={schoolYearId} onValueChange={setSchoolYearId} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectSchoolYear")} />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map((sy) => (
                      <SelectItem key={sy.id} value={sy.id}>
                        {sy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("startDate")}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("endDate")}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-current"
                checked={isCurrent}
                onChange={(e) => setIsCurrent(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="is-current">{t("isCurrent")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || !schoolYearId || !startDate || !endDate || saving}
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: itemToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up terms tab in settings page**

Add import and render condition:
```typescript
import { TermsTab } from "./components/terms-tab";
```
```tsx
{activeTab === "terms" && <TermsTab />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add terms tab with full CRUD"
```

---

## Task 10: Frontend — Timeslots Tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Create the timeslots tab component**

```tsx
// frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/hooks/use-api-client";
import type { TimeSlotResponse } from "@/lib/types";

const DAYS = [0, 1, 2, 3, 4, 5] as const;

export function TimeslotsTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.timeslots");
  const tc = useTranslations("common");
  const ta = useTranslations("settings.actions");

  const [items, setItems] = useState<TimeSlotResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TimeSlotResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [period, setPeriod] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");
  const [isBreak, setIsBreak] = useState(false);
  const [label, setLabel] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TimeSlotResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    apiClient
      .get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`)
      .then(setItems)
      .catch(() => toast.error(tc("errorLoadData")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const dayName = (day: number) => t(`days.${day}`);

  function openAddDialog() {
    setEditingItem(null);
    setDayOfWeek("0");
    setPeriod(1);
    setStartTime("08:00");
    setEndTime("08:45");
    setIsBreak(false);
    setLabel("");
    setDialogOpen(true);
  }

  function openEditDialog(item: TimeSlotResponse) {
    setEditingItem(item);
    setDayOfWeek(String(item.day_of_week));
    setPeriod(item.period);
    setStartTime(item.start_time);
    setEndTime(item.end_time);
    setIsBreak(item.is_break);
    setLabel(item.label ?? "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!startTime || !endTime || saving) return;
    setSaving(true);
    try {
      const body = {
        day_of_week: Number(dayOfWeek),
        period,
        start_time: startTime,
        end_time: endTime,
        is_break: isBreak,
        label: label.trim() || null,
      };
      if (editingItem) {
        await apiClient.put(`/api/schools/${schoolId}/timeslots/${editingItem.id}`, body);
      } else {
        await apiClient.post(`/api/schools/${schoolId}/timeslots`, body);
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error(tc("errorSaveData"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/schools/${schoolId}/timeslots/${itemToDelete.id}`);
      toast.success(t("deleted"));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409") || msg.includes("conflict") || msg.includes("referenced")) {
        toast.error(t("deleteConflict"));
      } else {
        toast.error(tc("errorSaveData"));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTitle")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("day")}</TableHead>
            <TableHead>{t("period")}</TableHead>
            <TableHead>{t("startTime")}–{t("endTime")}</TableHead>
            <TableHead>{t("label")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{dayName(item.day_of_week)}</TableCell>
              <TableCell>
                {item.period}
                {item.is_break && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{t("breakBadge")}</span>
                )}
              </TableCell>
              <TableCell>{item.start_time}–{item.end_time}</TableCell>
              <TableCell className="text-muted-foreground">{item.label ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("day")}</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {dayName(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("period")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("startTime")}</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("endTime")}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("label")}</Label>
              <Input
                placeholder={t("labelPlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-break"
                checked={isBreak}
                onChange={(e) => setIsBreak(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="is-break">{t("isBreak")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!startTime || !endTime || saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? tc("removing") : tc("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire up timeslots tab and finalize settings page**

Update `frontend/src/app/[locale]/schools/[id]/settings/page.tsx` to import all remaining tabs and render them:

```typescript
import { TermsTab } from "./components/terms-tab";
import { ClassesTab } from "./components/classes-tab";
import { SubjectsTab } from "./components/subjects-tab";
import { TeachersTab } from "./components/teachers-tab";
import { RoomsTab } from "./components/rooms-tab";
import { TimeslotsTab } from "./components/timeslots-tab";
```

Replace the tab content area with:
```tsx
<div>
  {activeTab === "terms" && <TermsTab />}
  {activeTab === "classes" && <ClassesTab />}
  {activeTab === "subjects" && <SubjectsTab />}
  {activeTab === "teachers" && <TeachersTab />}
  {activeTab === "rooms" && <RoomsTab />}
  {activeTab === "timeslots" && <TimeslotsTab />}
</div>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat: add timeslots tab, finalize all settings tabs"
```

---

## Task 11: Verify and Create PR

- [ ] **Step 1: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npx biome check src/`
Expected: no errors.

- [ ] **Step 3: Run backend check**

Run: `cargo check --workspace`
Expected: no errors.

- [ ] **Step 4: Create PR**

```bash
git push origin main
```

Then create a PR via `gh pr create`.
