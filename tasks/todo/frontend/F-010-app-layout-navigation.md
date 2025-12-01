# F-010: App Layout & Navigation

## Description

Create the main application layout with sidebar navigation and top header. This establishes the visual structure for all authenticated pages.

## Acceptance Criteria

- [ ] Add required shadcn/ui components:
  ```bash
  npx shadcn@latest add sheet dropdown-menu separator tooltip
  ```
- [ ] Create layout components in `components/layout/`:
  - [ ] `AppLayout.tsx` - Main layout wrapper with Outlet
  - [ ] `Sidebar.tsx` - Collapsible sidebar navigation
  - [ ] `TopHeader.tsx` - Top header bar
  - [ ] `NavItem.tsx` - Reusable navigation item
- [ ] Update `App.tsx` with nested route structure
- [ ] Update `Home.tsx` to navigate to dashboard

## Technical Details

### Layout Structure
```
+----------------------------------------------------------+
|  Top Header (app title, user menu placeholder)           |
+----------+-----------------------------------------------+
|          |                                               |
| Sidebar  |            Main Content Area                  |
| (collaps.|            <Outlet />                         |
|  icons)  |                                               |
+----------+-----------------------------------------------+
```

### Navigation Menu Items
1. Dashboard (`/dashboard`)
2. Teachers (`/teachers`)
3. Subjects (`/subjects`)
4. Rooms (`/rooms`)
5. Classes (`/classes`)
6. Time Slots (`/timeslots`)
7. Timetable (`/timetable`)
8. --- Separator ---
9. Settings (`/settings`)

### AppLayout.tsx
```tsx
export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col">
        <TopHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### Route Structure (App.tsx)
```tsx
<Routes>
  <Route path="/" element={<Home />} />

  <Route element={<AppLayout />}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/teachers" element={<TeachersListPage />} />
    <Route path="/teachers/new" element={<TeacherDetailPage />} />
    <Route path="/teachers/:id" element={<TeacherDetailPage />} />
    {/* ... other routes */}
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

### Sidebar Icons (lucide-react)
- Dashboard: `LayoutDashboard`
- Teachers: `Users`
- Subjects: `BookOpen`
- Rooms: `DoorOpen`
- Classes: `GraduationCap`
- Time Slots: `Clock`
- Timetable: `Calendar`
- Settings: `Settings`

### File Structure
```
components/
  layout/
    AppLayout.tsx
    Sidebar.tsx
    TopHeader.tsx
    NavItem.tsx
    index.ts
```

## Dependencies

None

## Blocks

- [F-011: Shared UI Components](F-011-shared-components.md)
- [F-012: Teachers CRUD Pages](F-012-teachers-crud.md)
- All other frontend page tasks

## Notes

### MVP Simplifications
- Single school mode (no school selector in header)
- User menu is placeholder (no auth yet)
- Desktop-first, basic mobile responsiveness

### Responsive Behavior
- Desktop: Sidebar always visible, can collapse to icons
- Mobile: Sidebar hidden, accessible via hamburger menu (Sheet component)
