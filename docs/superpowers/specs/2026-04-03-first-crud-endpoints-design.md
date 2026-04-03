# Step 5: First CRUD Endpoints — Design Spec

## Goal

Prove the full stack works end-to-end with real features: schools CRUD, membership management, and frontend pages with proper UI foundations.

## Backend API

### Schools CRUD — `/api/schools`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/schools` | `AuthUser` | Create school (creator becomes admin) |
| `GET` | `/api/schools` | `AuthUser` | List schools the user is a member of |
| `GET` | `/api/schools/:id` | `SchoolContext` | Get school details |
| `PUT` | `/api/schools/:id` | `SchoolContext` (admin) | Update school name/slug |

### Membership CRUD — `/api/schools/:id/members`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/schools/:id/members` | `SchoolContext` | List members (any role) |
| `POST` | `/api/schools/:id/members` | `SchoolContext` (admin) | Add member by email |
| `PUT` | `/api/schools/:id/members/:user_id` | `SchoolContext` (admin) | Change member role |
| `DELETE` | `/api/schools/:id/members/:user_id` | `SchoolContext` (admin) | Remove member |

### Request/Response Types

Dedicated structs per endpoint — no generic wrappers.

**Schools:**

```rust
// POST /api/schools
struct CreateSchoolRequest { name: String }
// Response: SchoolResponse

// PUT /api/schools/:id
struct UpdateSchoolRequest { name: Option<String>, slug: Option<String> }
// Response: SchoolResponse

struct SchoolResponse { id: Uuid, name: String, slug: String, role: String, created_at: DateTime }
// GET /api/schools returns Vec<SchoolResponse> (with user's role per school)
```

**Members:**

```rust
// POST /api/schools/:id/members
struct AddMemberRequest { email: String, role: String }
// Response: MemberResponse

// PUT /api/schools/:id/members/:user_id
struct UpdateMemberRoleRequest { role: String }
// Response: MemberResponse

struct MemberResponse { user_id: Uuid, email: String, display_name: Option<String>, role: String, is_active: bool, joined_at: DateTime }
```

### Role Enforcement

A `require_admin(ctx: &SchoolContext)` helper that returns 403 if the caller's membership role is not `admin`. Applied to all mutation endpoints on memberships and school updates.

### School Creation Transaction

`POST /api/schools` creates both the school and the creator's admin membership in a single database transaction. Slug is auto-generated from the name (lowercased, hyphenated). On collision, append a numeric suffix (e.g., `my-school-2`). Slug uniqueness is enforced at the DB level.

### Error Responses

Structured JSON: `{ "error": "message" }`. HTTP status codes:
- 400: invalid input (bad role value, missing fields)
- 403: not an admin for mutation endpoints
- 404: school or member not found
- 409: duplicate slug on school create, user already a member

## Frontend

### UI Foundation: shadcn/ui + Website Theme

Set up shadcn/ui with the existing pascalkraus.com theme:
- Full OKLch CSS variable set (teal primary, blue secondary, card, sidebar, muted, destructive, etc.)
- Fonts: Quicksand (sans), Lora (serif), Fira Code (mono)
- Dark mode via `next-themes` with class strategy
- `--radius: 1rem` for rounded aesthetic
- Shadows and tracking from the website

shadcn/ui components needed for this step: Button, Card, Input, Label, Table, Dialog, Select, Toast, Sidebar, DropdownMenu.

### `useApiClient` Hook

Replaces the inline `createApiClient()` calls in components:

```typescript
const client = useApiClient();
const schools = await client.get<SchoolResponse[]>("/api/schools");
```

Reads token from auth context. Accepts an optional `schoolId` parameter (or reads from a school context). Memoized.

### Pages

**`/schools`** — School list (centered layout, no sidebar)
- Lists schools the user belongs to (name, role, created date)
- "Create School" button → dialog with name field
- Clicking a school navigates to `/schools/[id]`

**`/schools/[id]`** — School dashboard (sidebar layout)
- Shows school name, slug, created date
- Sidebar with navigation: Dashboard, Members
- Edit school button (admin only) → dialog with name/slug fields

**`/schools/[id]/members`** — Member management (sidebar layout)
- Table: name, email, role, joined date
- "Add Member" button (admin only) → dialog with email + role select
- Role dropdown in table rows (admin only) → PUT on change
- Remove button (admin only) → confirmation dialog → DELETE
- Non-admins see the table but no mutation controls

### School Context Switching

- `/schools` page shows all schools the user belongs to
- Selecting a school stores the `schoolId` in React context
- `useApiClient` automatically includes `X-School-Id` header when a school is selected
- For multi-school users, the frontend-selected school takes precedence over the Keycloak token claim

### Error Handling

- Toast notifications (shadcn/ui) for success and error states
- 403 responses show "You don't have permission" — don't hide the page
- Form validation on the client before submission

## Data Flow: School Creation

1. User clicks "Create School" → dialog with name field
2. `POST /api/schools` (uses `AuthUser`, no school context needed)
3. Backend: create school + admin membership in one transaction
4. Frontend: redirect to `/schools/[id]`

## Data Flow: Member Management

1. Admin navigates to `/schools/[id]/members`
2. Member table loads via `GET /api/schools/:id/members`
3. Add: email + role form → `POST /api/schools/:id/members`
4. Role change: dropdown → `PUT /api/schools/:id/members/:user_id`
5. Remove: confirmation dialog → `DELETE /api/schools/:id/members/:user_id`

## Testing

### Backend (TDD)

- Unit tests: slug generation, model finder methods
- Integration tests per endpoint using `request!` macro and `TestKeyPair`:
  - School CRUD: create, list, get, update
  - Membership CRUD: list, add, role change, remove
  - Role enforcement: non-admin gets 403 on mutations
  - Edge cases: duplicate slug (auto-suffixed), add existing member (409), remove last admin (403 — prevented)
  - Transaction: school creation atomically creates membership

### Frontend

- Unit tests: `useApiClient` hook (mock fetch, verify headers)
- Component tests: school list rendering, member table role-based controls
- Uses existing `renderWithAuth` test utility

### E2E

Deferred to a future step. Backend integration + frontend component tests provide sufficient coverage.

## Out of Scope

- Invitation links / access request workflows
- School deletion (soft or hard)
- Pagination, search, filtering on lists
- Email notifications
- E2E test infrastructure setup
