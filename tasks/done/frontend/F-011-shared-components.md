# F-011: Shared UI Components

## Description

Create reusable UI components that establish consistent patterns across all pages. These components handle common states (loading, empty, error) and provide standard layouts for list and detail pages.

## Acceptance Criteria

- [x] Add required shadcn/ui components:
  ```bash
  npx shadcn@latest add table card badge skeleton dialog breadcrumb
  ```
- [x] Create shared components in `components/shared/`:
  - [x] `PageHeader.tsx` - Page title, description, actions, breadcrumbs
  - [x] `DataTable.tsx` - Generic data table with row click and sorting
  - [x] `LoadingState.tsx` - Loading spinner/skeleton
  - [x] `EmptyState.tsx` - No data placeholder with action
  - [x] `ErrorState.tsx` - Error display with retry button
  - [x] `ConfirmDialog.tsx` - Confirmation modal for destructive actions

## Technical Details

### PageHeader
```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

// Usage
<PageHeader
  title="Teachers"
  description="Manage your school's teaching staff"
  actions={<Button onClick={() => navigate('/teachers/new')}>Add Teacher</Button>}
  breadcrumbs={[
    { label: 'Teachers', href: '/teachers' },
    { label: 'Edit' }
  ]}
/>
```

### DataTable
```tsx
interface Column<T> {
  key: keyof T | string;
  header: string;
  cell?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  keyField?: keyof T;
}

// Usage
<DataTable
  data={teachers}
  columns={[
    { key: 'firstName', header: 'First Name' },
    { key: 'lastName', header: 'Last Name' },
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Status', cell: (row) => (
      <Badge variant={row.isActive ? 'default' : 'secondary'}>
        {row.isActive ? 'Active' : 'Inactive'}
      </Badge>
    )}
  ]}
  onRowClick={(teacher) => navigate(`/teachers/${teacher.id}`)}
  keyField="id"
/>
```

### LoadingState
```tsx
interface LoadingStateProps {
  message?: string;
  rows?: number; // For table skeleton
}

// Usage
<LoadingState message="Loading teachers..." rows={5} />
```

### EmptyState
```tsx
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

// Usage
<EmptyState
  icon={Users}
  title="No teachers yet"
  description="Add your first teacher to get started"
  action={<Button onClick={() => navigate('/teachers/new')}>Add Teacher</Button>}
/>
```

### ErrorState
```tsx
interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

// Usage
<ErrorState error={error} onRetry={() => refetch()} />
```

### ConfirmDialog
```tsx
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

// Usage
<ConfirmDialog
  open={showDeleteDialog}
  onOpenChange={setShowDeleteDialog}
  title="Delete Teacher"
  description="Are you sure you want to delete this teacher? This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
  isLoading={deleteMutation.isPending}
/>
```

### File Structure
```
components/
  shared/
    PageHeader.tsx
    DataTable.tsx
    LoadingState.tsx
    EmptyState.tsx
    ErrorState.tsx
    ConfirmDialog.tsx
    index.ts
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)

## Blocks

- [F-012: Teachers CRUD Pages](F-012-teachers-crud.md)
- All other CRUD page tasks

## Notes

### Design Principles
- Keep components simple and composable
- Use shadcn/ui primitives as building blocks
- Consistent spacing and typography via Tailwind
- Support for dark mode (CSS variables already set up)

### Future Enhancements
- DataTable: Filtering, pagination (sorting implemented)
- LoadingState: Different skeleton shapes
- Form components with Zod validation (separate task F-002)

## Completion Notes

**Completed:** 2025-12-01

### What was implemented

All 6 shared UI components with full test coverage (68 tests total):

| Component | Tests | Key Features |
|-----------|-------|--------------|
| LoadingState | 8 | Spinner + message, optional skeleton rows, uses `<output>` for a11y |
| EmptyState | 9 | Icon, title, description, action button |
| ErrorState | 9 | Error message display, retry button, alert role |
| PageHeader | 11 | Title, description, actions, i18n-aware breadcrumbs |
| DataTable | 18 | Generic typing, custom cell renderers, **column sorting**, keyboard navigation |
| ConfirmDialog | 13 | Destructive variant, loading state, accessible dialog |

### Key decisions

1. **DataTable sorting**: Implemented client-side sorting with click-to-toggle (asc → desc → asc). Server-side sorting can be added later with B-001 pagination.

2. **LoadingState skeleton**: Generic rectangular blocks rather than table-specific skeletons for flexibility across different contexts.

3. **Breadcrumb structure**: Used `Fragment` to properly separate `BreadcrumbItem` and `BreadcrumbSeparator` siblings (avoiding nested `<li>` elements).

4. **i18n keys**: Added to `common.json` for both DE and EN:
   - `loading`, `retry`, `cancel`, `confirm`, `delete`, `errorOccurred`

### Files created

```
src/components/shared/
├── ConfirmDialog.tsx + .test.tsx
├── DataTable.tsx + .test.tsx
├── EmptyState.tsx + .test.tsx
├── ErrorState.tsx + .test.tsx
├── LoadingState.tsx + .test.tsx
├── PageHeader.tsx + .test.tsx
└── index.ts
```

### Usage

```tsx
import {
  PageHeader,
  DataTable,
  LoadingState,
  EmptyState,
  ErrorState,
  ConfirmDialog,
  type Column,
  type BreadcrumbItem,
} from '@/components/shared';
```
