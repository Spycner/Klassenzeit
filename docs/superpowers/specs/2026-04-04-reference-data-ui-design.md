# Reference Data Management UI — Design Spec

## Overview

Admin-only Settings page with a tabbed interface for managing the 6 reference data entities: Terms, Classes, Subjects, Teachers, Rooms, and Timeslots. Uses dialogs for create/edit and follows existing frontend CRUD patterns.

## Navigation

- New sidebar item **"Settings"** with gear icon, placed below Schedule
- Visible only to users with `admin` role
- Route: `/schools/[id]/settings`

## Page Layout

- Page title: "Settings" with subtitle "Manage school reference data"
- Horizontal tab strip with 6 tabs: **Terms | Classes | Subjects | Teachers | Rooms | Timeslots**
- Active tab stored in URL search param (`?tab=teachers`) for shareability
- Default tab: Terms

## Per-Tab Pattern

Each tab renders:

1. **Header row** — entity name + description + "Add {entity}" button (right-aligned)
2. **Data table** — entity-specific columns + Actions column (edit, delete buttons)
3. **Empty state** — centered icon + message + "Add" CTA when no records exist
4. **Loading state** — skeleton rows while fetching

## Dialogs

### Add / Edit Dialog

- Triggered by "Add" button (empty form) or row Edit button (pre-filled form)
- Same dialog component reused for both add and edit per entity
- Fields match the entity's create/update API request shape
- Cancel and Save buttons in footer
- Save button disabled while submitting
- On success: close dialog, refresh table, show success toast
- On error: show error toast, keep dialog open

### Delete Confirmation Dialog

- Triggered by row Delete button
- **Soft-delete entities** (Teachers, Classes, Rooms): "This will deactivate {name}. It can be restored later."
- **Hard-delete entities** (Terms, Subjects, Timeslots): "This will permanently delete {name}. This cannot be undone."
- On 409 conflict: toast with "Cannot delete — still referenced by other records"
- Cancel and Delete buttons (Delete uses destructive variant)

## Entity Details

### Terms

**Table columns:** Name, Start Date, End Date, Current (badge), Actions

**Form fields:**
- Name (text, required)
- School Year (select from school_years, required) — note: school_years management is out of scope; assume they exist
- Start Date (date input, required)
- End Date (date input, required)
- Is Current (checkbox)

**Delete:** Hard delete. 409 if referenced by lessons/availability.

### Classes

**Table columns:** Name, Grade Level, Students, Class Teacher, Actions

**Form fields:**
- Name (text, required, e.g. "10A")
- Grade Level (number, required)
- Student Count (number, optional)
- Class Teacher (select from teachers list, optional)

**Delete:** Soft delete (deactivates).

### Subjects

**Table columns:** Abbreviation, Name, Color (swatch), Special Room (badge), Actions

**Form fields:**
- Name (text, required)
- Abbreviation (text, required, max 10 chars)
- Color (color picker or hex input, optional)
- Needs Special Room (checkbox)

**Delete:** Hard delete. 409 if referenced by lessons, teacher qualifications, or room suitabilities.

### Teachers

**Table columns:** Abbreviation, Name, Email, Max Hours, Part-time (badge), Actions

**Form fields:**
- First Name (text, required)
- Last Name (text, required)
- Abbreviation (text, required, max 5 chars)
- Email (text, optional)
- Max Hours per Week (number, default 28)
- Is Part-time (checkbox)

**Delete:** Soft delete (deactivates).

### Rooms

**Table columns:** Name, Building, Capacity, Actions

**Form fields:**
- Name (text, required)
- Building (text, optional)
- Capacity (number, optional)

**Delete:** Soft delete (deactivates).

### Timeslots

**Table columns:** Day, Period, Start–End, Break (badge), Label, Actions

**Form fields:**
- Day of Week (select: Monday–Friday, or Monday–Saturday)
- Period (number, required)
- Start Time (time input, required)
- End Time (time input, required)
- Is Break (checkbox)
- Label (text, optional, e.g. "1st Period")

**Delete:** Hard delete. 409 if referenced by lessons.

## Technical Decisions

### Component Structure

```
src/app/[locale]/schools/[id]/settings/
  page.tsx              — main settings page with tab state
  components/
    terms-tab.tsx       — Terms table + dialogs
    classes-tab.tsx     — Classes table + dialogs
    subjects-tab.tsx    — Subjects table + dialogs
    teachers-tab.tsx    — Teachers table + dialogs
    rooms-tab.tsx       — Rooms table + dialogs
    timeslots-tab.tsx   — Timeslots table + dialogs
```

Each tab component is self-contained: fetches its own data, manages its own dialog state.

### API Integration

- Uses existing `useApiClient()` hook
- Endpoints follow pattern: `GET/POST /api/schools/{id}/{entity}`, `PUT/DELETE /api/schools/{id}/{entity}/{entityId}`
- Refetch list after successful create/update/delete

### Form Handling

- Plain React state (consistent with existing patterns — no form library)
- Required field validation before submit
- Controlled inputs with value + onChange

### i18n

New `settings` namespace in `de.json` and `en.json`:
- Page title, subtitle
- Tab labels (6)
- Per-entity: column headers, form labels, placeholders, add/edit dialog titles, delete confirmation messages, success/error toasts

### Auth Guard

- Check `school?.role === "admin"` on page load
- Non-admins redirected or shown "Access denied" message
- Sidebar item hidden for non-admins

### Types

Add TypeScript interfaces in `src/lib/types.ts` for each entity response shape:
- `Term`, `SchoolClass`, `Subject`, `Teacher`, `Room`, `Timeslot`

## Prerequisites

- **School Years list endpoint** — `GET /api/schools/{id}/school-years` does not exist yet. Needed for the Terms form's school year select dropdown. Add a simple list-only endpoint (no CRUD needed for school years themselves yet).

## Out of Scope

- Full School Years CRUD (only a list endpoint is added)
- Bulk import/export
- Reordering or drag-and-drop
- Teacher qualifications, room suitabilities, availability (future features)
- Pagination (not needed at expected data volumes)
