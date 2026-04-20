"""subject color and simplify suitability

Revision ID: 0c49a790a7cb
Revises: aecd2cfdd285
Create Date: 2026-04-20 15:20:25.086726

Adds a required color column to subjects, backfills existing rows with a
stable name-hash over the 12-slot chart palette, and drops rooms.suitability_mode
because the single-mode rule now lives in application logic.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep the auto-generated revision string.
revision: str = "0c49a790a7cb"
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
