"""add scheduled_lessons table

Revision ID: 9175c45105fe
Revises: 0c49a790a7cb
Create Date: 2026-04-23 11:09:15.545945

Creates the scheduled_lessons join table that persists solver placements.
Composite PK is (lesson_id, time_block_id); all three FKs cascade on delete.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9175c45105fe"
down_revision: str | Sequence[str] | None = "0c49a790a7cb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "scheduled_lessons",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("time_block_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["lessons.id"],
            name=op.f("fk_scheduled_lessons_lesson_id_lessons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["rooms.id"],
            name=op.f("fk_scheduled_lessons_room_id_rooms"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["time_block_id"],
            ["time_blocks.id"],
            name=op.f("fk_scheduled_lessons_time_block_id_time_blocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("lesson_id", "time_block_id", name=op.f("pk_scheduled_lessons")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("scheduled_lessons")
