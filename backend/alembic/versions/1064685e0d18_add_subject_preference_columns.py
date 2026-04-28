"""add subject preference columns

Revision ID: 1064685e0d18
Revises: 9175c45105fe
Create Date: 2026-04-28 23:22:13.027720

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1064685e0d18"
down_revision: str | Sequence[str] | None = "9175c45105fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "subjects",
        sa.Column(
            "prefer_early_periods",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "subjects",
        sa.Column(
            "avoid_first_period",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("subjects", "avoid_first_period")
    op.drop_column("subjects", "prefer_early_periods")
