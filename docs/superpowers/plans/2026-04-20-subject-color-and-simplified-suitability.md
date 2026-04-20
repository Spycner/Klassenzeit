# Subject color and simplified room suitability: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a per-subject `color` and build an inline room-suitability chip editor, while simplifying `Room.suitability_mode` away.

**Architecture:** One Alembic migration adds `subjects.color` (backfilled from a stable name hash) and drops `rooms.suitability_mode`. Backend endpoints gain the color field and the suitability PUT returns a proactive 400 with `missing_subject_ids`. Frontend extends the CSS palette to 12 tokens, ships a color picker with custom hex escape hatch, and replaces the room mode selector with a multi-select chip picker. Two-request room save flow (POST/PATCH then PUT suitability) is wrapped in a combined React Query mutation.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2 (backend). Vite, React 19, TanStack Router/Query, shadcn/ui, React Hook Form + Zod, react-i18next (frontend). Vitest, MSW, pytest.

**Spec reference:** `docs/superpowers/specs/2026-04-20-subject-color-and-simplified-suitability-design.md`.

---

## Conventions the worker must follow

1. **TDD red/green.** Every code change ships with a test. Write the failing test, run it to see red, implement, run to see green, commit.
2. **Frequent commits.** One logical change per commit, using Conventional Commits (`cog verify` runs pre-commit). Examples: `feat(backend): persist subject color`, `feat(frontend): subject color picker`.
3. **No AI attribution.** Do not add `Co-Authored-By: Claude ...` or "Generated with" footers.
4. **Prefer editing over writing.** Edit existing files unless explicitly creating a new one.
5. **Run `mise run fe:types`** after the backend OpenAPI shape changes. The frontend will not type-check until this is done.
6. **Router regen.** After any new route file under `frontend/src/routes/`, run `mise exec -- pnpm -C frontend build` before `tsc --noEmit`. No new routes in this plan, but the rule still applies if one gets added.
7. **No em-dashes / en-dashes** in any prose (user global preference). Use commas, periods, colons, parentheses, or split into separate sentences.
8. **Python deps** go through `uv add`. **Frontend deps** go through `mise exec -- pnpm -C frontend add`. No hand-edits to `pyproject.toml` deps or `package.json` deps sections.
9. **i18n** keys land in both `frontend/src/i18n/locales/en.json` and `de.json`.
10. **Shell commands** use `mise run <task>` or `mise exec -- <cmd>` where the repo has a task, per `.claude/CLAUDE.md`.

---

## Phase A: Backend data model

### Task A1: Alembic migration (add `color`, backfill, drop `suitability_mode`)

**Files:**
- Create: `backend/alembic/versions/<rev>_subject_color_and_simplify_suitability.py`
- Modify: `backend/src/klassenzeit_backend/db/models/subject.py`
- Modify: `backend/src/klassenzeit_backend/db/models/room.py:21`
- Modify: `backend/tests/scheduling/conftest.py:179-198` (drop `suitability_mode` from `create_room` fixture)

- [ ] **Step 1: Generate the migration skeleton**

Run (from repo root, with DB running via `mise run db:up`):

```bash
cd backend && mise exec -- uv run alembic revision -m "subject color and simplify suitability"
```

Find the new file at `backend/alembic/versions/<rev>_subject_color_and_simplify_suitability.py`. Rename the file if the slug is missing underscores (alembic uses the message verbatim).

- [ ] **Step 2: Write the migration body**

Open the new file and replace `upgrade` and `downgrade` with:

```python
"""subject color and simplify suitability

Revision ID: <auto>
Revises: aecd2cfdd285
Create Date: <auto>

Adds a required color column to subjects, backfills existing rows with a
stable name-hash over the 12-slot chart palette, and drops rooms.suitability_mode
because the single-mode rule now lives in application logic.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep the auto-generated revision string.
revision: str = "<auto>"
down_revision: str | Sequence[str] | None = "aecd2cfdd285"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _autopick_color(name: str) -> str:
    """Return a stable 'chart-N' token for a subject name (N in 1..12).

    Deterministic djb2-style hash over the lowercase name. The frontend ships
    its own autopick function for the create-form preselect; the two do not
    need to agree because this backfill only runs once and the frontend value
    is only ever used as a default the user can override.
    """
    h = 0
    for ch in name.lower():
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return f"chart-{(h % 12) + 1}"


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "subjects",
        sa.Column("color", sa.String(length=16), nullable=True),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, name FROM subjects")).fetchall()
    for row in rows:
        bind.execute(
            sa.text("UPDATE subjects SET color = :c WHERE id = :id"),
            {"c": _autopick_color(row.name), "id": row.id},
        )
    op.alter_column("subjects", "color", nullable=False)
    op.drop_column("rooms", "suitability_mode")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "rooms",
        sa.Column(
            "suitability_mode",
            sa.String(length=16),
            server_default="general",
            nullable=False,
        ),
    )
    op.drop_column("subjects", "color")
```

Keep the auto-generated `revision` identifier that alembic wrote in Step 1.

- [ ] **Step 3: Update the Subject model**

Replace `backend/src/klassenzeit_backend/db/models/subject.py` contents with:

```python
"""Subject ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Subject(Base):
    """A school subject (e.g. Mathematik, Deutsch, Sport)."""

    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(100), unique=True)
    short_name: Mapped[str] = mapped_column(String(10), unique=True)
    color: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 4: Drop `suitability_mode` from the Room model**

In `backend/src/klassenzeit_backend/db/models/room.py`, delete the `suitability_mode` line (line 21):

```python
# delete this line entirely
suitability_mode: Mapped[str] = mapped_column(String(16), server_default="general")
```

- [ ] **Step 5: Update the `create_room` test fixture**

In `backend/tests/scheduling/conftest.py`, edit the `_make_room` function signature and body to remove `suitability_mode`. The final function looks like:

```python
async def _make_room(
    *,
    name: str | None = None,
    short_name: str | None = None,
    capacity: int | None = None,
) -> Room:
    """Create and flush a Room with auto-generated unique defaults.

    Args:
        name: Room name; auto-generated if omitted.
        short_name: Short label; auto-generated if omitted.
        capacity: Optional seating capacity.

    Returns:
        The newly created Room ORM instance.
    """
    n = next(_room_counter)
    room = Room(
        name=name if name is not None else f"Room {n}",
        short_name=short_name if short_name is not None else f"R{n}",
        capacity=capacity,
    )
    db_session.add(room)
    await db_session.flush()
    return room
```

- [ ] **Step 6: Run the migration against a clean DB**

```bash
mise run db:reset
mise run db:migrate
```

Expected: `alembic upgrade head` completes without error, ending at the new revision.

- [ ] **Step 7: Verify downgrade works**

```bash
cd backend && mise exec -- uv run alembic downgrade -1 && mise exec -- uv run alembic upgrade head
```

Expected: both commands succeed; final state is the new head.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic/versions/*_subject_color_and_simplify_suitability.py \
  backend/src/klassenzeit_backend/db/models/subject.py \
  backend/src/klassenzeit_backend/db/models/room.py \
  backend/tests/scheduling/conftest.py
git commit -m "feat(db): add subject color and drop room suitability_mode"
```

---

### Task A2: Subject schema + routes with color validation

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/subject.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/subjects.py`
- Modify: `backend/tests/scheduling/test_subjects.py`

- [ ] **Step 1: Write failing tests for color**

Append these three tests to the bottom of `backend/tests/scheduling/test_subjects.py`:

```python
async def test_create_subject_requires_color(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /subjects without color returns 422 Unprocessable Entity."""
    await create_test_user(email="admin@color1.com", role="admin")
    await login_as("admin@color1.com", "testpassword123")
    response = await client.post("/api/subjects", json={"name": "NoColor", "short_name": "NC"})
    assert response.status_code == 422


async def test_create_subject_rejects_invalid_color(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /subjects with malformed color returns 422."""
    await create_test_user(email="admin@color2.com", role="admin")
    await login_as("admin@color2.com", "testpassword123")
    response = await client.post(
        "/api/subjects", json={"name": "Bad", "short_name": "BD", "color": "not-a-color"}
    )
    assert response.status_code == 422


async def test_patch_subject_color(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PATCH /subjects/{id} can update color alone."""
    await create_test_user(email="admin@color3.com", role="admin")
    await login_as("admin@color3.com", "testpassword123")
    create = await client.post(
        "/api/subjects", json={"name": "Color Me", "short_name": "CM", "color": "chart-3"}
    )
    subject_id = create.json()["id"]
    response = await client.patch(f"/api/subjects/{subject_id}", json={"color": "#112233"})
    assert response.status_code == 200
    assert response.json()["color"] == "#112233"
```

Also edit every existing POST body in `test_subjects.py` that posts to `/api/subjects` to include a `color` field. Search for lines like `json={"name": ..., "short_name": ...}` and add `, "color": "chart-1"`. There are roughly 9 call sites; do them all.

- [ ] **Step 2: Run tests to verify most fail**

```bash
mise run test:py -- -k test_subjects
```

Expected: many failures with 422 responses for existing tests (they're not sending `color`) and missing-field errors for the new tests.

- [ ] **Step 3: Update SubjectCreate / SubjectUpdate / SubjectResponse**

Replace `backend/src/klassenzeit_backend/scheduling/schemas/subject.py` with:

```python
"""Pydantic schemas for subject routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

COLOR_PATTERN = r"^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$"


class SubjectCreate(BaseModel):
    """Request body for creating a subject."""

    name: str
    short_name: str
    color: str = Field(pattern=COLOR_PATTERN)


class SubjectUpdate(BaseModel):
    """Request body for patching a subject."""

    name: str | None = None
    short_name: str | None = None
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)


class SubjectResponse(BaseModel):
    """Response body for a subject."""

    id: uuid.UUID
    name: str
    short_name: str
    color: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Update routes to plumb the color through**

In `backend/src/klassenzeit_backend/scheduling/routes/subjects.py`:

- In `create_subject_route` (around line 62), change the `Subject(...)` call and the final `SubjectResponse(...)` to include `color=body.color` and `color=subject.color` respectively.
- In `list_subjects`, update the response builder to include `color=s.color`.
- In `get_subject`, add `color=subject.color` to the response.
- In `update_subject`, add `if body.color is not None: subject.color = body.color` after the `short_name` block, and include `color=subject.color` in the final response.

Final shape of `create_subject_route` body:

```python
subject = Subject(name=body.name, short_name=body.short_name, color=body.color)
db.add(subject)
try:
    await db.commit()
except IntegrityError as exc:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="A subject with this name or short_name already exists.",
    ) from exc
await db.refresh(subject)
return SubjectResponse(
    id=subject.id,
    name=subject.name,
    short_name=subject.short_name,
    color=subject.color,
    created_at=subject.created_at,
    updated_at=subject.updated_at,
)
```

Apply the same `color=s.color` / `color=subject.color` in `list_subjects`, `get_subject`, and `update_subject`.

- [ ] **Step 5: Run tests again**

```bash
mise run test:py -- -k test_subjects
```

Expected: all subject tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/schemas/subject.py \
  backend/src/klassenzeit_backend/scheduling/routes/subjects.py \
  backend/tests/scheduling/test_subjects.py
git commit -m "feat(backend): persist subject color with palette-or-hex validation"
```

---

### Task A3: Drop `suitability_mode` from Room routes and tests

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/room.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/rooms.py`
- Modify: `backend/tests/scheduling/test_rooms.py`

- [ ] **Step 1: Update Room schemas**

In `backend/src/klassenzeit_backend/scheduling/schemas/room.py`:

- Remove the `from typing import Literal` import; it's no longer used.
- Remove `suitability_mode` from `RoomCreate`, `RoomUpdate`, `RoomListResponse`, `RoomDetailResponse`.

Final shape:

```python
"""Pydantic schemas for room routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    """Request body for creating a room."""

    name: str
    short_name: str
    capacity: int | None = Field(default=None, ge=1)


class RoomUpdate(BaseModel):
    """Request body for patching a room."""

    name: str | None = None
    short_name: str | None = None
    capacity: int | None = Field(default=None, ge=1)


class SuitabilitySubjectResponse(BaseModel):
    """Subject in a room's suitability list."""

    id: uuid.UUID
    name: str
    short_name: str


class AvailabilityResponse(BaseModel):
    """Time block in a room's availability list."""

    time_block_id: uuid.UUID
    day_of_week: int
    position: int


class RoomListResponse(BaseModel):
    """Response body for a room in list view."""

    id: uuid.UUID
    name: str
    short_name: str
    capacity: int | None
    created_at: datetime
    updated_at: datetime


class RoomDetailResponse(BaseModel):
    """Response body for a room detail view."""

    id: uuid.UUID
    name: str
    short_name: str
    capacity: int | None
    suitability_subjects: list[SuitabilitySubjectResponse]
    availability: list[AvailabilityResponse]
    created_at: datetime
    updated_at: datetime


class SuitabilityReplaceRequest(BaseModel):
    """Request body for replacing a room's suitability list."""

    subject_ids: list[uuid.UUID]


class AvailabilityReplaceRequest(BaseModel):
    """Request body for replacing a room's availability list."""

    time_block_ids: list[uuid.UUID]
```

- [ ] **Step 2: Update routes to drop `suitability_mode`**

In `backend/src/klassenzeit_backend/scheduling/routes/rooms.py`:

- In `_build_room_detail` (around line 86), remove `suitability_mode=room.suitability_mode,`.
- In `create_room_route` (around line 118), remove `suitability_mode=body.suitability_mode,` from the `Room(...)` call and remove `suitability_mode=room.suitability_mode,` from the `RoomListResponse(...)` return.
- In `list_rooms` (around line 165), remove `suitability_mode=r.suitability_mode,`.
- In `update_room_route` (around line 225), remove the `if body.suitability_mode is not None:` block (two lines) and the `suitability_mode=room.suitability_mode,` from the final return.
- Update the docstring for `create_room_route` to replace "Name, short_name, capacity, and suitability_mode for the new room." with "Name, short_name, and capacity for the new room.".

- [ ] **Step 3: Update Room tests**

In `backend/tests/scheduling/test_rooms.py`:

- Delete the entire `test_create_specialized_room` function (currently lines 44 to 65).
- In `test_create_room`, delete the line `assert body["suitability_mode"] == "general"`.

- [ ] **Step 4: Run tests**

```bash
mise run test:py -- -k test_rooms
```

Expected: existing room tests pass. If a test references `suitability_mode` elsewhere, grep for it and remove.

```bash
grep -rn "suitability_mode" backend/
```

Expected: no matches in `backend/src` or `backend/tests`. Only matches should be in the migration file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/schemas/room.py \
  backend/src/klassenzeit_backend/scheduling/routes/rooms.py \
  backend/tests/scheduling/test_rooms.py
git commit -m "feat(backend): drop room suitability_mode in favor of single-mode inclusion"
```

---

### Task A4: Tighten `PUT /rooms/{id}/suitability` with typed 400

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/room.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/rooms.py`
- Modify: `backend/tests/scheduling/test_rooms.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/scheduling/test_rooms.py`:

```python
async def test_put_suitability_rejects_missing_subject_ids(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PUT /rooms/{id}/suitability with an unknown subject_id returns 400 with the missing ids."""
    import uuid as _uuid

    await create_test_user(email="admin@suit-miss.com", role="admin")
    await login_as("admin@suit-miss.com", "testpassword123")
    room_resp = await client.post("/api/rooms", json={"name": "Miss Room", "short_name": "MR"})
    room_id = room_resp.json()["id"]
    fake_id = str(_uuid.uuid4())
    response = await client.put(
        f"/api/rooms/{room_id}/suitability",
        json={"subject_ids": [fake_id]},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["detail"]["missing_subject_ids"] == [fake_id]


async def test_put_suitability_dedupes_duplicates(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PUT /rooms/{id}/suitability collapses duplicate subject_ids to a single row."""
    await create_test_user(email="admin@suit-dup.com", role="admin")
    await login_as("admin@suit-dup.com", "testpassword123")
    room_resp = await client.post("/api/rooms", json={"name": "Dup Room", "short_name": "DR"})
    room_id = room_resp.json()["id"]
    subj_resp = await client.post(
        "/api/subjects",
        json={"name": "Dedup Subject", "short_name": "DS", "color": "chart-1"},
    )
    subject_id = subj_resp.json()["id"]
    response = await client.put(
        f"/api/rooms/{room_id}/suitability",
        json={"subject_ids": [subject_id, subject_id, subject_id]},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["suitability_subjects"]) == 1
    assert body["suitability_subjects"][0]["id"] == subject_id


async def test_put_suitability_empty_list(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PUT /rooms/{id}/suitability with [] clears the suitability set."""
    await create_test_user(email="admin@suit-empty.com", role="admin")
    await login_as("admin@suit-empty.com", "testpassword123")
    room_resp = await client.post("/api/rooms", json={"name": "Empty Room", "short_name": "ER"})
    room_id = room_resp.json()["id"]
    subj_resp = await client.post(
        "/api/subjects",
        json={"name": "Goes Away", "short_name": "GA", "color": "chart-2"},
    )
    subject_id = subj_resp.json()["id"]
    await client.put(
        f"/api/rooms/{room_id}/suitability", json={"subject_ids": [subject_id]}
    )
    response = await client.put(
        f"/api/rooms/{room_id}/suitability", json={"subject_ids": []}
    )
    assert response.status_code == 200
    assert response.json()["suitability_subjects"] == []
```

- [ ] **Step 2: Run tests to see failures**

```bash
mise run test:py -- -k "test_put_suitability"
```

Expected: missing-id test fails with 409 (not 400); dedup test fails with IntegrityError on composite PK; empty-list test may pass but run it to confirm.

- [ ] **Step 3: Add the typed error schema**

Append to `backend/src/klassenzeit_backend/scheduling/schemas/room.py`:

```python
class MissingSubjectsErrorDetail(BaseModel):
    """Detail payload for 400 Bad Request when suitability references unknown subjects."""

    detail: str
    missing_subject_ids: list[uuid.UUID]
```

- [ ] **Step 4: Update the route**

Replace the body of `replace_room_suitability` in `backend/src/klassenzeit_backend/scheduling/routes/rooms.py` (starting at the `room = await _get_room` line) with:

```python
    room = await _get_room(db, room_id)
    # Deduplicate while preserving order.
    seen: set[uuid.UUID] = set()
    unique_ids: list[uuid.UUID] = []
    for sid in body.subject_ids:
        if sid not in seen:
            seen.add(sid)
            unique_ids.append(sid)

    if unique_ids:
        found = await db.execute(select(Subject.id).where(Subject.id.in_(unique_ids)))
        found_ids = {row[0] for row in found}
        missing = [sid for sid in unique_ids if sid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "detail": "Some subjects do not exist.",
                    "missing_subject_ids": [str(m) for m in missing],
                },
            )

    await db.execute(
        delete(RoomSubjectSuitability).where(RoomSubjectSuitability.room_id == room_id)
    )
    for subject_id in unique_ids:
        db.add(RoomSubjectSuitability(room_id=room_id, subject_id=subject_id))
    await db.commit()

    await db.refresh(room)
    return await _build_room_detail(db, room)
```

Update the docstring's `Raises:` section to:

```python
    Raises:
        HTTPException: 404 if no room with that ID exists.
        HTTPException: 400 if any subject_id does not exist; body contains
            ``missing_subject_ids`` list.
```

Remove the now-unused `IntegrityError` import if nothing else in the file uses it (check: `delete_room_route` does, so keep it).

- [ ] **Step 5: Run tests**

```bash
mise run test:py -- -k test_rooms
```

Expected: all room tests green including the three new ones.

- [ ] **Step 6: Run the full backend suite**

```bash
mise run test:py
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/schemas/room.py \
  backend/src/klassenzeit_backend/scheduling/routes/rooms.py \
  backend/tests/scheduling/test_rooms.py
git commit -m "feat(backend): tighten room suitability PUT with typed 400 on missing subjects"
```

---

## Phase B: Frontend infrastructure

### Task B1: Regenerate OpenAPI types

**Files:**
- Modify (auto-generated): `frontend/src/lib/api-types.ts`

- [ ] **Step 1: Regenerate types**

Backend must be running for this:

```bash
mise run db:up
mise run dev &   # or keep a second shell with mise run dev
sleep 3
mise run fe:types
```

Expected: `frontend/src/lib/api-types.ts` updates to drop `suitability_mode` and add `color` on subject schemas. The file is git-tracked but labeled as build output in CLAUDE.md; commit the regen anyway since it is the frozen contract the plan depends on.

- [ ] **Step 2: Stop the dev server**

If you started one with `mise run dev &`, stop it: `fg` then Ctrl+C, or `kill %1`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api-types.ts
git commit -m "chore(frontend): regenerate API types"
```

---

### Task B2: Extend CSS chart palette to 12 tokens

**Files:**
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: Add tokens `--chart-6` through `--chart-12` in `:root`**

In `frontend/src/styles/app.css`, find the `:root` block (around line 29) and after `--chart-5`, insert:

```css
  --chart-6: oklch(0.685 0.15 30);     /* warm orange */
  --chart-7: oklch(0.78 0.11 180);     /* teal */
  --chart-8: oklch(0.65 0.17 10);      /* coral */
  --chart-9: oklch(0.72 0.13 260);     /* indigo */
  --chart-10: oklch(0.6 0.14 130);     /* moss */
  --chart-11: oklch(0.78 0.09 50);     /* sand */
  --chart-12: oklch(0.58 0.12 340);    /* plum */
```

- [ ] **Step 2: Mirror in `.dark` block**

Find the `.dark` block (around line 87) and after `--chart-5`, insert the same seven tokens with slightly higher lightness for contrast on dark:

```css
  --chart-6: oklch(0.78 0.13 30);
  --chart-7: oklch(0.83 0.1 180);
  --chart-8: oklch(0.73 0.15 10);
  --chart-9: oklch(0.8 0.11 260);
  --chart-10: oklch(0.72 0.12 130);
  --chart-11: oklch(0.85 0.08 50);
  --chart-12: oklch(0.68 0.11 340);
```

- [ ] **Step 3: Expose via `@theme inline`**

In the `@theme inline` block (starts around line 110), find `--color-chart-5` (line 142) and insert after it:

```css
  --color-chart-6: var(--chart-6);
  --color-chart-7: var(--chart-7);
  --color-chart-8: var(--chart-8);
  --color-chart-9: var(--chart-9);
  --color-chart-10: var(--chart-10);
  --color-chart-11: var(--chart-11);
  --color-chart-12: var(--chart-12);
```

- [ ] **Step 4: Verify build still works**

```bash
mise run fe:build
```

Expected: build succeeds. No TS or CSS errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/app.css
git commit -m "feat(frontend): extend chart palette to 12 tokens"
```

---

### Task B3: Color utility module

**Files:**
- Create: `frontend/src/features/subjects/color.ts`
- Create: `frontend/src/features/subjects/color.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/features/subjects/color.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { autoPickColor, isValidColor, resolveSubjectColor } from "./color";

describe("resolveSubjectColor", () => {
  test("maps chart tokens to CSS variables", () => {
    expect(resolveSubjectColor("chart-1")).toBe("var(--chart-1)");
    expect(resolveSubjectColor("chart-12")).toBe("var(--chart-12)");
  });

  test("returns hex literals unchanged", () => {
    expect(resolveSubjectColor("#2563eb")).toBe("#2563eb");
    expect(resolveSubjectColor("#abcdef")).toBe("#abcdef");
  });
});

describe("autoPickColor", () => {
  test("is deterministic for the same name", () => {
    expect(autoPickColor("Mathematik")).toBe(autoPickColor("Mathematik"));
  });

  test("is case-insensitive", () => {
    expect(autoPickColor("Art")).toBe(autoPickColor("art"));
  });

  test("always returns a chart token in the 1..12 range", () => {
    const names = ["a", "longer name", "Ümlaut", "123"];
    for (const name of names) {
      const value = autoPickColor(name);
      expect(value).toMatch(/^chart-(1[0-2]|[1-9])$/);
    }
  });
});

describe("isValidColor", () => {
  test("accepts chart tokens 1..12", () => {
    for (let i = 1; i <= 12; i++) expect(isValidColor(`chart-${i}`)).toBe(true);
  });

  test("rejects out-of-range chart tokens", () => {
    expect(isValidColor("chart-0")).toBe(false);
    expect(isValidColor("chart-13")).toBe(false);
    expect(isValidColor("chart-abc")).toBe(false);
  });

  test("accepts 6-digit hex (case-insensitive)", () => {
    expect(isValidColor("#abcdef")).toBe(true);
    expect(isValidColor("#ABCDEF")).toBe(true);
    expect(isValidColor("#123456")).toBe(true);
  });

  test("rejects malformed hex", () => {
    expect(isValidColor("abcdef")).toBe(false);     // missing #
    expect(isValidColor("#abc")).toBe(false);        // 3-digit
    expect(isValidColor("#gggggg")).toBe(false);     // non-hex
    expect(isValidColor("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects/color.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Implement the module**

Create `frontend/src/features/subjects/color.ts`:

```ts
export const COLOR_PATTERN = /^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$/;

export function resolveSubjectColor(color: string): string {
  if (color.startsWith("chart-")) {
    return `var(--${color})`;
  }
  return color;
}

export function isValidColor(color: string): boolean {
  return COLOR_PATTERN.test(color);
}

export function autoPickColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) {
    h = (h * 31 + ch.charCodeAt(0)) | 0;
  }
  const slot = (Math.abs(h) % 12) + 1;
  return `chart-${slot}`;
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects/color.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/subjects/color.ts frontend/src/features/subjects/color.test.ts
git commit -m "feat(frontend): subject color resolution and stable auto-pick"
```

---

### Task B4: Color picker component

**Files:**
- Create: `frontend/src/features/subjects/color-picker.tsx`
- Create: `frontend/src/features/subjects/color-picker.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/features/subjects/color-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ColorPicker } from "./color-picker";

describe("ColorPicker", () => {
  test("renders 12 palette swatches", () => {
    render(<ColorPicker value="chart-1" onChange={vi.fn()} />);
    const swatches = screen.getAllByRole("button", { name: /chart-\d+/ });
    expect(swatches).toHaveLength(12);
  });

  test("clicking a swatch calls onChange with the token", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "chart-5" }));
    expect(onChange).toHaveBeenCalledWith("chart-5");
  });

  test("entering a valid hex calls onChange with the hex value", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /custom hex/i });
    await userEvent.clear(input);
    await userEvent.type(input, "#abcdef");
    expect(onChange).toHaveBeenLastCalledWith("#abcdef");
  });

  test("entering an invalid hex does not call onChange", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /custom hex/i });
    await userEvent.clear(input);
    await userEvent.type(input, "nope");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("marks the selected swatch with aria-pressed=true", () => {
    render(<ColorPicker value="chart-7" onChange={vi.fn()} />);
    const selected = screen.getByRole("button", { name: "chart-7" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    const unselected = screen.getByRole("button", { name: "chart-1" });
    expect(unselected).toHaveAttribute("aria-pressed", "false");
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects/color-picker.test.tsx
```

Expected: module-not-found error.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/subjects/color-picker.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidColor, resolveSubjectColor } from "./color";

const PALETTE: readonly string[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
  "chart-10",
  "chart-11",
  "chart-12",
];

interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const initialHex = value.startsWith("#") ? value : "";
  const [hexInput, setHexInput] = useState(initialHex);

  function handleHexChange(raw: string) {
    setHexInput(raw);
    if (isValidColor(raw)) onChange(raw);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2" role="group" aria-label={t("subjects.color")}>
        {PALETTE.map((token) => {
          const selected = value === token;
          return (
            <button
              key={token}
              type="button"
              aria-label={token}
              aria-pressed={selected}
              onClick={() => onChange(token)}
              className={cn(
                "h-9 w-9 rounded-md border border-border/60 transition",
                selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
              style={{ background: resolveSubjectColor(token) }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="h-6 w-6 rounded-md border border-border/60"
          style={{ background: isValidColor(hexInput) ? hexInput : "transparent" }}
          aria-hidden="true"
        />
        <Input
          type="text"
          aria-label={t("subjects.customColor")}
          placeholder="#rrggbb"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          maxLength={7}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the required i18n keys**

In `frontend/src/i18n/locales/en.json`, inside the `"subjects"` object (around line 94), add `"color"` and `"customColor"` keys at the same level as `"title"`:

```json
    "color": "Color",
    "customColor": "Custom hex",
```

In `frontend/src/i18n/locales/de.json`, add the same shape:

```json
    "color": "Farbe",
    "customColor": "Eigener Hex",
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects/color-picker.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/subjects/color-picker.tsx \
  frontend/src/features/subjects/color-picker.test.tsx \
  frontend/src/i18n/locales/en.json \
  frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): subject color picker with 12-swatch palette and hex escape"
```

---

## Phase C: Subjects UI

### Task C1: Subject form + dialog + page uses persisted color

**Files:**
- Modify: `frontend/src/features/subjects/schema.ts`
- Modify: `frontend/src/features/subjects/subjects-dialogs.tsx`
- Modify: `frontend/src/features/subjects/subjects-page.tsx`
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1: Update schema**

Replace `frontend/src/features/subjects/schema.ts`:

```ts
import { z } from "zod";
import { COLOR_PATTERN } from "./color";

export const SubjectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
  color: z.string().regex(COLOR_PATTERN, "Invalid color"),
});

export type SubjectFormValues = z.infer<typeof SubjectFormSchema>;
```

- [ ] **Step 2: Update the dialog to include the color picker**

In `frontend/src/features/subjects/subjects-dialogs.tsx`:

Add imports at the top:

```tsx
import { autoPickColor } from "./color";
import { ColorPicker } from "./color-picker";
```

Change `defaultValues` (around line 41) to:

```tsx
    defaultValues: {
      name: subject?.name ?? "",
      short_name: subject?.short_name ?? "",
      color: subject?.color ?? autoPickColor(""),
    },
```

Note: when creating, the initial color is `autoPickColor("")` which yields `chart-1`. Watch the `name` field and auto-pick while the user types, but only if they haven't manually picked. Simplest: keep the default and let the user pick explicitly.

After the `short_name` FormField (end of it, around line 105), insert a new FormField for color:

```tsx
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("subjects.color")}</FormLabel>
                  <FormControl>
                    <ColorPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 3: Update the subjects page to use persisted color**

In `frontend/src/features/subjects/subjects-page.tsx`:

Replace the inline `subjectColor(subject.id)` call on line 86 with `resolveSubjectColor(subject.color)`.

Update the import list at the top to add:

```tsx
import { resolveSubjectColor } from "./color";
```

Delete the `subjectColor` helper function at the bottom of the file (lines 164-169).

- [ ] **Step 4: Update MSW handlers to include color**

In `frontend/tests/msw-handlers.ts`:

- Line 16 (`initialSubjects[0]`): add `color: "chart-3"` after `short_name: "MA"`.
- POST `/api/subjects` handler (around line 127): cast the body to include `color: string`, and include `color: body.color` in the response. Final handler:

```ts
  http.post(`${BASE}/api/subjects`, async ({ request }) => {
    const body = (await request.json()) as { name: string; short_name: string; color: string };
    return HttpResponse.json(
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: body.name,
        short_name: body.short_name,
        color: body.color,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
```

Also update any other seed subjects to include a `color` (there is one other place: `initialLessons[0].subject` does not need color since it uses a nested subject shape, but check by regenerating types: if the lesson's nested subject type requires color, add it).

Run `grep -n "short_name" frontend/tests/msw-handlers.ts | grep -v lessons` to find any subject-shaped literals still missing color. The only one is `initialSubjects[0]`.

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects
```

Expected: all tests in the subjects feature pass.

- [ ] **Step 6: Run the full frontend test suite**

```bash
mise run fe:test
```

Expected: green (other features may need subject `color` added to MSW seeds; if any test fails because of missing color, add `color: "chart-N"` to the relevant seed).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/subjects/schema.ts \
  frontend/src/features/subjects/subjects-dialogs.tsx \
  frontend/src/features/subjects/subjects-page.tsx \
  frontend/tests/msw-handlers.ts
git commit -m "feat(frontend): wire subject color picker into create/edit dialog and list"
```

---

## Phase D: Rooms UI

### Task D1: Subject multi-picker component

**Files:**
- Create: `frontend/src/features/rooms/subject-multi-picker.tsx`
- Create: `frontend/src/features/rooms/subject-multi-picker.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/features/rooms/subject-multi-picker.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { SubjectMultiPicker } from "./subject-multi-picker";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("SubjectMultiPicker", () => {
  test("renders selected subjects as chips", async () => {
    render(
      wrap(
        <SubjectMultiPicker
          value={["11111111-1111-1111-1111-111111111111"]}
          onChange={vi.fn()}
        />,
      ),
    );
    expect(await screen.findByText("Mathematik")).toBeInTheDocument();
  });

  test("filters the add list by search input", async () => {
    render(wrap(<SubjectMultiPicker value={[]} onChange={vi.fn()} />));
    await screen.findByText("Mathematik");
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, "nope");
    await waitFor(() => expect(screen.queryByText("Mathematik")).not.toBeInTheDocument());
  });

  test("clicking an unselected subject adds it", async () => {
    const onChange = vi.fn();
    render(wrap(<SubjectMultiPicker value={[]} onChange={onChange} />));
    const entry = await screen.findByRole("button", { name: /Mathematik/ });
    await userEvent.click(entry);
    expect(onChange).toHaveBeenCalledWith(["11111111-1111-1111-1111-111111111111"]);
  });

  test("clicking an active chip removes it", async () => {
    const onChange = vi.fn();
    render(
      wrap(
        <SubjectMultiPicker
          value={["11111111-1111-1111-1111-111111111111"]}
          onChange={onChange}
        />,
      ),
    );
    const chip = await screen.findByRole("button", { name: /remove Mathematik/i });
    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/subject-multi-picker.test.tsx
```

Expected: module-not-found.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/rooms/subject-multi-picker.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { resolveSubjectColor } from "@/features/subjects/color";
import { useSubjects } from "@/features/subjects/hooks";
import { cn } from "@/lib/utils";

interface SubjectMultiPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function SubjectMultiPicker({ value, onChange }: SubjectMultiPickerProps) {
  const { t } = useTranslation();
  const subjectsQuery = useSubjects();
  const [query, setQuery] = useState("");

  const subjects = subjectsQuery.data ?? [];
  const selectedSet = new Set(value);
  const selected = subjects.filter((s) => selectedSet.has(s.id));
  const unselected = subjects
    .filter((s) => !selectedSet.has(s.id))
    .filter((s) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.short_name.toLowerCase().includes(q);
    });

  function add(id: string) {
    onChange([...value, id]);
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex min-h-10 flex-wrap gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2",
          selected.length === 0 && "items-center",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("rooms.suitableSubjectsEmpty")}</span>
        ) : (
          selected.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={`remove ${s.name}`}
              onClick={() => remove(s.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-background px-2 py-0.5 text-xs shadow-sm transition hover:bg-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: resolveSubjectColor(s.color) }}
                aria-hidden="true"
              />
              {s.name}
              <span aria-hidden="true" className="text-muted-foreground">
                ×
              </span>
            </button>
          ))
        )}
      </div>
      <Input
        type="search"
        placeholder={t("common.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
        {unselected.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">{t("common.noResults")}</div>
        ) : (
          unselected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => add(s.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: resolveSubjectColor(s.color) }}
                aria-hidden="true"
              />
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {s.short_name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/subject-multi-picker.test.tsx
```

Expected: pass. The MSW handlers already seed `Mathematik` and its `color` is added by Task C1; if this test was running before that change, it would fail.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/rooms/subject-multi-picker.tsx \
  frontend/src/features/rooms/subject-multi-picker.test.tsx
git commit -m "feat(frontend): reusable subject multi-picker for room suitability"
```

---

### Task D2: Room schema + hooks + MSW handlers for suitability

**Files:**
- Modify: `frontend/src/features/rooms/schema.ts`
- Modify: `frontend/src/features/rooms/hooks.ts`
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1: Update Room schema**

Replace `frontend/src/features/rooms/schema.ts`:

```ts
import { z } from "zod";

export const RoomFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
  capacity: z.number().int().min(1).optional(),
  suitable_subject_ids: z.array(z.string()).default([]),
});

export type RoomFormValues = z.infer<typeof RoomFormSchema>;
```

- [ ] **Step 2: Extend rooms hooks with combined mutations**

Replace `frontend/src/features/rooms/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Room = components["schemas"]["RoomListResponse"];
export type RoomDetail = components["schemas"]["RoomDetailResponse"];
export type RoomCreate = components["schemas"]["RoomCreate"];
export type RoomUpdate = components["schemas"]["RoomUpdate"];

export const roomsQueryKey = ["rooms"] as const;
export const roomDetailQueryKey = (id: string) => ["rooms", id] as const;

export function useRooms() {
  return useQuery({
    queryKey: roomsQueryKey,
    queryFn: async (): Promise<Room[]> => {
      const { data } = await client.GET("/api/rooms");
      if (!data) throw new ApiError(500, null, "Empty response from /rooms");
      return data;
    },
  });
}

export function useRoomDetail(id: string | null) {
  return useQuery({
    queryKey: id ? roomDetailQueryKey(id) : ["rooms", "none"],
    enabled: id !== null,
    queryFn: async (): Promise<RoomDetail> => {
      const { data } = await client.GET("/api/rooms/{room_id}", {
        params: { path: { room_id: id as string } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /rooms/{id}");
      return data;
    },
  });
}

async function putSuitability(roomId: string, subjectIds: string[]): Promise<void> {
  await client.PUT("/api/rooms/{room_id}/suitability", {
    params: { path: { room_id: roomId } },
    body: { subject_ids: subjectIds },
  });
}

export function useCreateRoomWithSuitability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      base: RoomCreate;
      suitable_subject_ids: string[];
    }): Promise<Room> => {
      const { data } = await client.POST("/api/rooms", { body: args.base });
      if (!data) throw new ApiError(500, null, "Empty response from POST /rooms");
      if (args.suitable_subject_ids.length > 0) {
        await putSuitability(data.id, args.suitable_subject_ids);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useUpdateRoomWithSuitability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      base: RoomUpdate;
      suitable_subject_ids: string[];
      original_suitable_subject_ids: string[];
    }): Promise<Room> => {
      const { data } = await client.PATCH("/api/rooms/{room_id}", {
        params: { path: { room_id: args.id } },
        body: args.base,
      });
      if (!data) throw new ApiError(500, null, "Empty response from PATCH /rooms/{id}");
      const changed =
        args.suitable_subject_ids.length !== args.original_suitable_subject_ids.length ||
        args.suitable_subject_ids.some(
          (id, i) => id !== args.original_suitable_subject_ids[i],
        );
      if (changed) {
        await putSuitability(args.id, args.suitable_subject_ids);
      }
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: roomsQueryKey });
      queryClient.invalidateQueries({ queryKey: roomDetailQueryKey(vars.id) });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/rooms/{room_id}", {
        params: { path: { room_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}
```

- [ ] **Step 3: Update MSW handlers**

In `frontend/tests/msw-handlers.ts`:

Replace `initialRooms` (lines 25-35) with (drop `suitability_mode`):

```ts
export const initialRooms = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Raum 101",
    short_name: "101",
    capacity: 30,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];
```

Add a mutable suitability store after `stundentafelEntriesByTafelId` (around line 84):

```ts
export const roomSuitabilityByRoomId: Record<string, string[]> = {
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": [],
};
```

Update the `POST /api/rooms` handler (around line 141) to drop `suitability_mode` from the typed cast and response:

```ts
  http.post(`${BASE}/api/rooms`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      short_name: string;
      capacity: number | null;
    };
    const id = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    roomSuitabilityByRoomId[id] = [];
    return HttpResponse.json(
      {
        id,
        ...body,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
```

Add new handlers for `GET /api/rooms/:room_id` and `PUT /api/rooms/:room_id/suitability` right after the POST:

```ts
  http.get(`${BASE}/api/rooms/:room_id`, ({ params }) => {
    const id = String(params.room_id);
    const base = initialRooms.find((r) => r.id === id);
    const selectedIds = roomSuitabilityByRoomId[id] ?? [];
    const suitability_subjects = selectedIds
      .map((sid) => initialSubjects.find((s) => s.id === sid))
      .filter((s): s is (typeof initialSubjects)[number] => s !== undefined)
      .map((s) => ({ id: s.id, name: s.name, short_name: s.short_name }));
    if (!base) {
      return HttpResponse.json({ detail: "not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...base,
      suitability_subjects,
      availability: [],
    });
  }),
  http.put(`${BASE}/api/rooms/:room_id/suitability`, async ({ request, params }) => {
    const body = (await request.json()) as { subject_ids: string[] };
    const id = String(params.room_id);
    const seen = new Set<string>();
    const unique = body.subject_ids.filter((sid) => {
      if (seen.has(sid)) return false;
      seen.add(sid);
      return true;
    });
    const missing = unique.filter(
      (sid) => !initialSubjects.some((s) => s.id === sid),
    );
    if (missing.length > 0) {
      return HttpResponse.json(
        { detail: { detail: "Some subjects do not exist.", missing_subject_ids: missing } },
        { status: 400 },
      );
    }
    roomSuitabilityByRoomId[id] = unique;
    const base = initialRooms.find((r) => r.id === id) ?? {
      id,
      name: "mutable",
      short_name: "X",
      capacity: null,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    };
    const suitability_subjects = unique
      .map((sid) => initialSubjects.find((s) => s.id === sid))
      .filter((s): s is (typeof initialSubjects)[number] => s !== undefined)
      .map((s) => ({ id: s.id, name: s.name, short_name: s.short_name }));
    return HttpResponse.json({
      ...base,
      suitability_subjects,
      availability: [],
    });
  }),
```

- [ ] **Step 4: Update the MSW reset pattern in tests**

In `frontend/tests/setup.ts` (verify the path), the existing `beforeEach` likely resets `stundentafelEntriesByTafelId`. Extend it to also reset `roomSuitabilityByRoomId`. Open `tests/setup.ts`, find the reset block, and add:

```ts
import { roomSuitabilityByRoomId } from "./msw-handlers";
// ...
for (const key of Object.keys(roomSuitabilityByRoomId)) {
  roomSuitabilityByRoomId[key] = [];
}
```

If no reset block currently exists for the stundentafel store, this task is correctly the first one to introduce the pattern. Add a `beforeEach` that resets both stores.

- [ ] **Step 5: Run tests**

```bash
mise run fe:test
```

Expected: green (no new tests yet in this task; later tasks consume the new hooks and handlers).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/rooms/schema.ts \
  frontend/src/features/rooms/hooks.ts \
  frontend/tests/msw-handlers.ts \
  frontend/tests/setup.ts
git commit -m "feat(frontend): room suitability schema, combined mutations, and MSW stubs"
```

---

### Task D3: Room dialog with chip picker; drop mode selector

**Files:**
- Modify: `frontend/src/features/rooms/rooms-dialogs.tsx`
- Create: `frontend/src/features/rooms/rooms-dialogs.test.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`

- [ ] **Step 1: Update i18n keys**

In `frontend/src/i18n/locales/en.json`, inside `"rooms"`:
- Remove `"mode": "Mode",` from `"columns"`.
- Remove the `"suitabilityModes": {...}` block entirely.
- Add new keys inside `"rooms"`:

```json
    "suitableSubjects": "Suitable subjects",
    "suitableSubjectsEmpty": "Empty list means any subject may be scheduled here.",
    "suitableSubjectsError": "Some subjects no longer exist. Please re-select.",
    "columns": {
      "name": "Name",
      "shortName": "Short name",
      "capacity": "Capacity",
      "subjects": "Subjects",
      "actions": "Actions"
    }
```

In `frontend/src/i18n/locales/de.json`, mirror:
- Drop `"mode"` and `"suitabilityModes"`.
- Add:

```json
    "suitableSubjects": "Geeignete Fächer",
    "suitableSubjectsEmpty": "Leere Liste: jedes Fach kann hier stattfinden.",
    "suitableSubjectsError": "Einige Fächer existieren nicht mehr. Bitte neu auswählen.",
    "columns": {
      "name": "Name",
      "shortName": "Kürzel",
      "capacity": "Kapazität",
      "subjects": "Fächer",
      "actions": "Aktionen"
    }
```

- [ ] **Step 2: Write failing tests for the dialog**

Create `frontend/src/features/rooms/rooms-dialogs.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { roomSuitabilityByRoomId } from "../../../tests/msw-handlers";
import { RoomFormDialog } from "./rooms-dialogs";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("RoomFormDialog create flow", () => {
  beforeEach(() => {
    for (const k of Object.keys(roomSuitabilityByRoomId)) roomSuitabilityByRoomId[k] = [];
  });

  test("does not render a suitability mode selector", async () => {
    render(wrap(<RoomFormDialog open onOpenChange={() => {}} submitLabel="Create" />));
    expect(screen.queryByText(/mode/i)).not.toBeInTheDocument();
  });

  test("can submit with a selected subject and calls PUT suitability", async () => {
    render(wrap(<RoomFormDialog open onOpenChange={() => {}} submitLabel="Create" />));
    await userEvent.type(screen.getByLabelText(/name/i), "Gym");
    await userEvent.type(screen.getByLabelText(/short name/i), "GM");
    const mathChip = await screen.findByRole("button", { name: /Mathematik/ });
    await userEvent.click(mathChip);
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(
        roomSuitabilityByRoomId["dddddddd-dddd-dddd-dddd-dddddddddddd"],
      ).toEqual(["11111111-1111-1111-1111-111111111111"]),
    );
  });
});
```

- [ ] **Step 3: Run tests to see them fail**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/rooms-dialogs.test.tsx
```

Expected: failing; `RoomFormDialog` still has a mode selector and doesn't wire suitability.

- [ ] **Step 4: Rewrite `rooms-dialogs.tsx`**

Replace `frontend/src/features/rooms/rooms-dialogs.tsx` with:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import {
  type Room,
  useCreateRoomWithSuitability,
  useDeleteRoom,
  useRoomDetail,
  useUpdateRoomWithSuitability,
} from "./hooks";
import { RoomFormSchema, type RoomFormValues } from "./schema";
import { SubjectMultiPicker } from "./subject-multi-picker";

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitLabel: string;
  room?: Room;
}

export function RoomFormDialog({ open, onOpenChange, submitLabel, room }: RoomFormDialogProps) {
  const { t } = useTranslation();
  const detail = useRoomDetail(room ? room.id : null);
  const original = detail.data?.suitability_subjects.map((s) => s.id) ?? [];

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(RoomFormSchema),
    defaultValues: {
      name: room?.name ?? "",
      short_name: room?.short_name ?? "",
      capacity: room?.capacity ?? undefined,
      suitable_subject_ids: original,
    },
    values: room
      ? {
          name: room.name,
          short_name: room.short_name,
          capacity: room.capacity ?? undefined,
          suitable_subject_ids: original,
        }
      : undefined,
  });
  const createMutation = useCreateRoomWithSuitability();
  const updateMutation = useUpdateRoomWithSuitability();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const title = room ? t("rooms.dialog.editTitle") : t("rooms.dialog.createTitle");
  const description = room
    ? t("rooms.dialog.editDescription", { name: room.name })
    : t("rooms.dialog.createDescription");

  async function handleRoomSubmit(values: RoomFormValues) {
    const capacity = typeof values.capacity === "number" ? values.capacity : null;
    try {
      if (room) {
        await updateMutation.mutateAsync({
          id: room.id,
          base: { name: values.name, short_name: values.short_name, capacity },
          suitable_subject_ids: values.suitable_subject_ids,
          original_suitable_subject_ids: original,
        });
      } else {
        await createMutation.mutateAsync({
          base: { name: values.name, short_name: values.short_name, capacity },
          suitable_subject_ids: values.suitable_subject_ids,
        });
      }
      form.reset();
      onOpenChange(false);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        err.data &&
        typeof err.data === "object" &&
        "missing_subject_ids" in err.data
      ) {
        form.setError("suitable_subject_ids", {
          type: "custom",
          message: t("rooms.suitableSubjectsError"),
        });
        return;
      }
      throw err;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleRoomSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="short_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.shortName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.capacity")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="suitable_subject_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.suitableSubjects")}</FormLabel>
                  <FormControl>
                    <SubjectMultiPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("common.saving") : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteRoomDialogProps {
  room: Room;
  onClose: () => void;
}

export function DeleteRoomDialog({ room, onClose }: DeleteRoomDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteRoom();
  async function confirmRoomDelete() {
    await mutation.mutateAsync(room.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rooms.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("rooms.dialog.deleteDescription", { name: room.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirmRoomDelete} disabled={mutation.isPending}>
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the dialog tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/rooms-dialogs.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/rooms/rooms-dialogs.tsx \
  frontend/src/features/rooms/rooms-dialogs.test.tsx \
  frontend/src/i18n/locales/en.json \
  frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): room dialog with subject chip picker in place of mode selector"
```

---

### Task D4: Rooms page drops Mode column

**Files:**
- Modify: `frontend/src/features/rooms/rooms-page.tsx`

- [ ] **Step 1: Update the page**

In `frontend/src/features/rooms/rooms-page.tsx`:

- Remove the import of `cn` and `suitabilityModeKey` if unused after the edit.
- Delete the `<TableHead>` for mode (around line 76) and replace it with a "Subjects" header column that will be filled later, or simply leave it off for now. Simplest: delete the Mode header and the `<TableCell>` that renders the pill (the whole block at lines 94-106 inclusive).
- Remove the line `const mode = suitabilityModeKey(room.suitability_mode);` and the surrounding wrapper; map straight from `room`.

Concretely, the table body block becomes:

```tsx
              <TableBody>
                {rows.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="py-1.5 font-medium">{room.name}</TableCell>
                    <TableCell className="py-1.5 font-mono text-[12.5px]">
                      {room.short_name}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {room.capacity ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(room)}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
```

Matching table header:

```tsx
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("rooms.columns.name")}</TableHead>
                  <TableHead className="py-2">{t("rooms.columns.shortName")}</TableHead>
                  <TableHead className="py-2 text-right">{t("rooms.columns.capacity")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("rooms.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
```

Note: the `"—"` glyph in the capacity cell is already in the file as visual content (not prose). Leave it untouched.

- [ ] **Step 2: Run full frontend suite**

```bash
mise run fe:test
```

Expected: green. If any existing test asserts on "Mode" text or the mode pill, update it.

- [ ] **Step 3: Run the build to catch tsc errors**

```bash
mise run fe:build
cd frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/rooms/rooms-page.tsx
git commit -m "feat(frontend): drop room mode column from list view"
```

---

## Phase E: Docs, cleanup, PR

### Task E1: ADR 0011

**Files:**
- Create: `docs/adr/0011-subject-color-and-simplified-suitability.md`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0011-subject-color-and-simplified-suitability.md`:

```markdown
# 0011: Subject color and simplified room suitability

Status: Accepted
Date: 2026-04-20

## Context

Two adjacent data-model gaps in the scheduling domain:

1. Subject swatches were client-derived from a hash over the UUID, with no way for admins to pick a color and no stability across re-creations.
2. The `rooms.suitability_mode` flag flipped the meaning of the `RoomSubjectSuitability` join table (`general` treated the list as exclusions; `specialized` treated it as inclusions). The feature had no frontend surface, no solver consumer, and the inversion logic was opaque to anyone reading the code cold.

## Decision

Add a required `color` column on `subjects`, stored either as a palette key (`chart-1` through `chart-12`) or a six-digit hex literal. Extend the CSS palette from 5 to 12 tokens to cover typical school catalogues.

Drop `rooms.suitability_mode`. The `RoomSubjectSuitability` join now always means "this room is suitable for this subject." Validity becomes a both-sides-gated rule:

1. The room's suitable-list is empty, or it contains the subject.
2. No room lists this subject, or this room is one of those.

In plain English: a room without any listings accepts any subject; a room that lists subjects is restricted to those; a subject that no room lists can go anywhere; a subject that some rooms list can only go in those. Worked examples:

| Subject | Room | Room's list | Rooms listing subject | Valid? |
| --- | --- | --- | --- | --- |
| PE | Gym | `[PE, Sport]` | `{Gym}` | yes |
| PE | Classroom | `[]` | `{Gym}` | no |
| Maths | Classroom | `[]` | `{}` | yes |
| Maths | Gym | `[PE, Sport]` | `{}` | no |

Enforcement lives in application logic. The solver is still a skeleton; it will consume this rule when it grows a scheduling pass.

Proactive validation: `PUT /rooms/{id}/suitability` now returns HTTP 400 with a typed `missing_subject_ids` payload on unknown IDs, rather than the previous integrity-error-derived 409.

## Why token keys over hex for the default

Token keys resolve to CSS custom properties at render time, so dark-mode re-skins and any future palette shift happen without a data migration. The hex escape hatch stays available for users who need off-palette colors.

## Scope boundaries

No solver enforcement yet. No subject-side "allowed rooms" editor (room is the authoring side). No bulk import/export that carries color. Color collisions above 12 subjects are acceptable at current school scale; the custom hex input covers users who want to break the tie.

## Consequences

Positive:
- One rule, one storage shape, one direction of edit. Readers can answer "where does PE belong?" with a single table look-up instead of mode-dependent interpretation.
- Frontend renders a persisted palette slot; re-creating a subject no longer churns the color.
- Typed 400 errors let the UI keep the edit dialog open and surface which IDs went missing, instead of a generic 409 toast.

Negative:
- Any existing `RoomSubjectSuitability` row on a general-purpose room (previously meaning "excluded") silently reverses meaning. The migration left the data intact; staging had no such rows at the time of this change.
- Two-request room save flow (POST or PATCH, then PUT suitability). On PUT failure the base row persists; the UI leaves the dialog open for the user to retry.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0011-subject-color-and-simplified-suitability.md
git commit -m "docs: ADR 0011 for subject color and simplified room suitability"
```

---

### Task E2: Update OPEN_THINGS.md

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the shipped subject-color item**

Delete the bullet "Subject color as a real column. ..." (currently around line 14).

- [ ] **Step 2: Amend the sub-resource editors bullet**

Find the "Sub-resource editors for base entities." bullet (around line 19). Replace its text with:

```markdown
- **Sub-resource editors for base entities.** Room suitability (chip editor inside the room dialog) shipped in the subject-color + suitability PR. Room availability, Teacher availability, Teacher qualifications, and WeekScheme time blocks still need their own editors. Treat the remaining four as one "manage related rows" spec rather than one spec per entity.
```

- [ ] **Step 3: Amend the multi-select chip editors bullet**

Find "Multi-select chip editors for sub-resources." (around line 18). Replace its text with:

```markdown
- **Multi-select chip editors for sub-resources.** Room suitability ships as an inline chip editor under the room dialog. The pattern (chip list + search + scrollable add list, shadcn-only primitives) is now established for teacher qualifications and anything else where a parent edits a flat set of related entity IDs.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: record subject color shipped and amend sub-resource editor notes"
```

---

### Task E3: Full verification pass

**Files:**
- Modify: `.coverage-baseline-frontend` (potentially)

- [ ] **Step 1: Run all linters**

```bash
mise run lint
```

Expected: clean across ruff, ty, vulture, clippy, machete, cargo fmt, biome.

- [ ] **Step 2: Run all tests**

```bash
mise run test
```

Expected: green backend, green frontend, green Rust (solver is unchanged).

- [ ] **Step 3: Regenerate frontend coverage baseline**

```bash
mise run fe:test:cov
mise run fe:cov:update-baseline
```

Expected: baseline file gets a new percentage reflecting the added components. If the baseline drops below 50, investigate.

- [ ] **Step 4: Re-run strict tsc**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit the baseline if it changed**

```bash
git diff --quiet .coverage-baseline-frontend || (
  git add .coverage-baseline-frontend &&
  git commit -m "chore(frontend): ratchet coverage baseline after suitability editor"
)
```

---

### Task E4: Push and open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/subject-color-and-room-suitability
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: subject color and simplified room suitability" --body "$(cat <<'EOF'
## Summary

- Persist `color` on `Subject` (palette key `chart-1..12` or hex) with a 12-swatch picker plus a custom hex escape hatch.
- Collapse `Room.suitability_mode` into a single inclusion model. `RoomSubjectSuitability` now always means "suitable for"; validity is a both-sides-gated rule documented in ADR 0011.
- Replace the room mode selector with an inline multi-select chip picker inside the room edit dialog.
- Tighten `PUT /rooms/{id}/suitability`: proactive 400 with typed `missing_subject_ids` instead of an integrity-error-derived 409.
- CSS palette extended from 5 to 12 chart tokens across light and dark themes.
- Single Alembic migration: add `subjects.color` (backfill from a stable name-hash), drop `rooms.suitability_mode`.

## Test plan

- [ ] Backend: pytest green including new subject-color and suitability tests.
- [ ] Frontend: Vitest green including color picker, multi-picker, and rooms dialog flow.
- [ ] `alembic upgrade head` clean; `downgrade -1 && upgrade head` round-trips.
- [ ] Manual: create a subject in dev, pick a swatch + custom hex, confirm persisted; create a room with suitable subjects; edit the room and add/remove chips.
- [ ] Confirm staging rollout on next master push (backend auto-migrates on container start).

## Spec and ADR

- Spec: `docs/superpowers/specs/2026-04-20-subject-color-and-simplified-suitability-design.md`
- ADR: `docs/adr/0011-subject-color-and-simplified-suitability.md`
EOF
)"
```

- [ ] **Step 3: Return the PR URL to the user**

---

## Self-review checklist for the plan author

1. Every spec requirement is covered by a task.
2. No "TBD", "TODO", or "similar to Task N" placeholders.
3. Type names match between tasks (SubjectResponse has `color`, Room schemas drop `suitability_mode`, error detail shape is consistent).
4. Each commit message is Conventional Commits compliant and has a scope.
5. The plan does not assume solver changes, Playwright changes, or a new CRUD route.
