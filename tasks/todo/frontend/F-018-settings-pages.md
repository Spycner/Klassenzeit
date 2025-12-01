# F-018: Settings & Academic Calendar Pages

## Description

Implement the settings section including school profile configuration and academic calendar management (school years and terms).

## Acceptance Criteria

- [ ] Create `pages/settings/SettingsPage.tsx`:
  - [ ] Settings overview/index page
  - [ ] Links to sub-sections
- [ ] Create `pages/settings/SchoolProfilePage.tsx`:
  - [ ] Display/edit school details
  - [ ] Fields: name, timezone, settings JSON
- [ ] Create `pages/settings/SchoolYearsPage.tsx`:
  - [ ] List school years
  - [ ] Create/edit school year
  - [ ] Navigate to terms for each year
- [ ] Create `pages/settings/TermsPage.tsx`:
  - [ ] List terms for a school year
  - [ ] Create/edit term
  - [ ] Show term dates and association with year

## Technical Details

### SettingsPage (Index)
```tsx
function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your school and academic calendar"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card onClick={() => navigate('/settings/school')}>
          <CardHeader>
            <Building2 className="h-8 w-8" />
            <CardTitle>School Profile</CardTitle>
            <CardDescription>Name, timezone, and general settings</CardDescription>
          </CardHeader>
        </Card>

        <Card onClick={() => navigate('/settings/years')}>
          <CardHeader>
            <CalendarDays className="h-8 w-8" />
            <CardTitle>Academic Calendar</CardTitle>
            <CardDescription>School years and terms</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
```

### SchoolProfilePage
```tsx
function SchoolProfilePage() {
  const { data: school } = useSchool(schoolId);
  const updateMutation = useUpdateSchool();

  // Form with:
  // - name (text)
  // - timezone (select from common timezones)
  // - settings (JSON editor or structured form)
}
```

### SchoolYearsPage
```tsx
function SchoolYearsPage() {
  const { data: years } = useSchoolYears();

  // List with:
  // - Name (e.g., "2024/2025")
  // - Start date
  // - End date
  // - Number of terms
  // - Actions: Edit, View Terms

  // Create new year form/modal
}
```

### TermsPage
```tsx
function TermsPage() {
  const { yearId } = useParams();
  const { data: year } = useSchoolYear(yearId);
  const { data: terms } = useTerms(yearId);

  // Breadcrumbs: Settings > Academic Calendar > 2024/2025 > Terms

  // List with:
  // - Name (e.g., "Fall Semester", "1. Halbjahr")
  // - Start date
  // - End date
  // - Actions: Edit, Delete

  // Create new term form/modal
}
```

### Form Fields

**School Profile:**
| Field | Type | Validation |
|-------|------|------------|
| name | text | Required |
| timezone | select | Required, IANA timezone |
| settings | JSON | Optional, key-value pairs |

**School Year:**
| Field | Type | Validation |
|-------|------|------------|
| name | text | Required (e.g., "2024/2025") |
| startDate | date | Required |
| endDate | date | Required, after startDate |

**Term:**
| Field | Type | Validation |
|-------|------|------------|
| name | text | Required (e.g., "Fall Semester") |
| startDate | date | Required, within school year |
| endDate | date | Required, after startDate, within school year |

### Routes
```
/settings              -> SettingsPage (index)
/settings/school       -> SchoolProfilePage
/settings/years        -> SchoolYearsPage
/settings/years/:yearId/terms -> TermsPage
```

### File Structure
```
pages/
  settings/
    SettingsPage.tsx
    SchoolProfilePage.tsx
    SchoolYearsPage.tsx
    TermsPage.tsx
    components/
      SchoolForm.tsx
      SchoolYearForm.tsx
      TermForm.tsx
```

## Dependencies

- [F-010: App Layout & Navigation](F-010-app-layout-navigation.md)
- [F-011: Shared UI Components](F-011-shared-components.md)

## Blocks

None

## Notes

### API Hooks Used
- `useSchool(id)` - Get school details
- `useUpdateSchool()` - Update school
- `useSchoolYears()` - List school years
- `useSchoolYear(id)` - Get single school year
- `useCreateSchoolYear()` - Create school year
- `useUpdateSchoolYear()` - Update school year
- `useDeleteSchoolYear()` - Delete school year
- `useTerms(yearId)` - List terms for a year
- `useTerm(id)` - Get single term
- `useCreateTerm()` - Create term
- `useUpdateTerm()` - Update term
- `useDeleteTerm()` - Delete term

### MVP Simplifications
- Single school mode (school ID is assumed/hardcoded)
- Basic timezone selection (can expand later)
- Settings JSON as raw editor (can add structured UI later)

### German Academic Calendar
Typical structure:
- School Year: August to July (e.g., "2024/2025")
- Terms: 2 semesters ("1. Halbjahr", "2. Halbjahr")

Some schools use quarters or trimesters instead.
