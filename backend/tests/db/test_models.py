"""Tests for the model re-export surface.

Alembic autogenerate only sees models whose module has been imported
before ``env.py`` builds ``target_metadata``. ``db/models/__init__.py``
is the single import point that populates ``Base.metadata``.
"""

from sqlalchemy import DateTime, Integer

from klassenzeit_backend.db.base import Base
from klassenzeit_backend.db.models import Ping


def test_ping_model_is_registered_on_metadata() -> None:
    assert "ping" in Base.metadata.tables


def test_ping_has_expected_columns() -> None:
    table = Base.metadata.tables["ping"]
    id_col = table.c["id"]
    created_col = table.c["created_at"]

    assert id_col.primary_key
    assert isinstance(id_col.type, Integer)

    assert isinstance(created_col.type, DateTime)
    assert created_col.type.timezone is True
    assert created_col.server_default is not None
    assert created_col.nullable is False


def test_ping_is_importable_from_models_package() -> None:
    # Sanity check: the re-export pattern works — a consumer can import
    # Ping from the package root, not just from the private _ping module.
    assert Ping.__tablename__ == "ping"
