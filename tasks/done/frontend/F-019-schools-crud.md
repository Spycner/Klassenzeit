# F-019: Schools CRUD Pages

## Description

Implement Schools management pages for platform admins and school admins to create, configure, and maintain schools.

## Acceptance Criteria

- [x] Schools list page showing all accessible schools
- [x] Create school page (platform admins only)
- [x] Edit school page with basic info form
- [x] Delete school with confirmation
- [x] Members section to view/edit roles and remove members
- [x] Settings section (placeholder - see F-023)
- [x] Role-based access control (platform admin vs school admin)
- [x] German and English translations

## Implementation

### New Files Created
- `src/api/types/membership.ts` - TypeScript types for memberships
- `src/api/services/memberships.ts` - API service for membership CRUD
- `src/api/hooks/use-memberships.ts` - React Query hooks
- `src/hooks/use-school-access.ts` - Permission checking hook
- `src/pages/SchoolsListPage.tsx` - List view with DataTable
- `src/pages/SchoolDetailPage.tsx` - Create/edit with sections
- `src/pages/schools/components/SchoolForm.tsx` - Basic info form
- `src/pages/schools/components/MembersSection.tsx` - Member management
- `src/pages/schools/components/SchoolSettingsSection.tsx` - Settings UI

### Files Modified
- `src/App.tsx` - Added school routes
- `src/components/layout/Sidebar.tsx` - Added Schools nav item
- `src/api/hooks/query-client.ts` - Added memberships query keys
- Various index.ts files for exports
- Translation files (de/en)

## Notes

- "Add Member" button is disabled - requires user search API (see F-022)
- Settings section shows placeholder fields - needs redesign (see F-023)
- Backend API was already complete, only frontend work needed

## Related Tasks

- F-022: Add School Members (pending - needs backend endpoint)
- F-023: School Settings Redesign (pending - needs teacher input)

## Completed

2024-12-06
