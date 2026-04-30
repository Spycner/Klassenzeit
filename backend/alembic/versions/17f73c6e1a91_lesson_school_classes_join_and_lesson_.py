"""lesson_school_classes_join_and_lesson_group_id

Revision ID: 17f73c6e1a91
Revises: 1064685e0d18
Create Date: 2026-04-30 12:22:20.495322

Replaces ``lessons.school_class_id`` (single FK) with a many-to-many
``lesson_school_classes`` join table, and adds a nullable
``lessons.lesson_group_id`` so cross-class lessons (e.g. parallel
Religionsmodell trio) share one group identifier. The old
``(school_class_id, subject_id)`` UNIQUE is dropped; the route layer
performs the equivalent pre-check across membership rows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "17f73c6e1a91"
down_revision: str | Sequence[str] | None = "1064685e0d18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "lesson_school_classes",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("school_class_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["lessons.id"],
            name=op.f("fk_lesson_school_classes_lesson_id_lessons"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["school_class_id"],
            ["school_classes.id"],
            name=op.f("fk_lesson_school_classes_school_class_id_school_classes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "lesson_id", "school_class_id", name=op.f("pk_lesson_school_classes")
        ),
    )
    op.add_column("lessons", sa.Column("lesson_group_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_lessons_lesson_group_id"), "lessons", ["lesson_group_id"], unique=False
    )

    # Backfill: every existing Lesson becomes a single-membership row.
    op.execute(
        """
        INSERT INTO lesson_school_classes (lesson_id, school_class_id)
        SELECT id, school_class_id FROM lessons
        """
    )

    op.drop_index(op.f("ix_lessons_school_class_id"), table_name="lessons")
    op.drop_constraint(op.f("uq_lessons_school_class_id"), "lessons", type_="unique")
    op.drop_constraint(
        op.f("fk_lessons_school_class_id_school_classes"), "lessons", type_="foreignkey"
    )
    op.drop_column("lessons", "school_class_id")


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError(
        "Multi-class lessons are not encodable in a single FK; downgrade requires "
        "manual schema surgery."
    )
