# F-011: Shared UI Components

## Description

Create reusable UI components that establish consistent patterns across all pages. These components handle common states (loading, empty, error) and provide standard layouts for list and detail pages.

## Acceptance Criteria

- [ ] Add required shadcn/ui components:
  ```bash
  npx shadcn@latest add table card badge skeleton dialog breadcrumb
  ```
- [ ] Create shared components in `components/shared/`:
  - [ ] `PageHeader.tsx` - Page title, description, actions, breadcrumbs
  - [ ] `DataTable.tsx` - Generic data table with row click
  - [ ] `LoadingState.tsx` - Loading spinner/skeleton
  - [ ] `EmptyState.tsx` - No data placeholder with action
  - [ ] `ErrorState.tsx` - Error display with retry button
  - [ ] `ConfirmDialog.tsx` - Confirmation modal for destructive actions

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
- DataTable: Sorting, filtering, pagination
- LoadingState: Different skeleton shapes
- Form components with Zod validation (separate task F-002)
