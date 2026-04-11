"""Tests for the declarative Base's naming convention.

Constraint naming must be stable across environments so Alembic
autogenerate diffs don't drift.
"""

from klassenzeit_backend.db.base import Base


def test_base_has_naming_convention() -> None:
    convention = Base.metadata.naming_convention
    assert convention["ix"] == "ix_%(column_0_label)s"
    assert convention["uq"] == "uq_%(table_name)s_%(column_0_name)s"
    assert convention["ck"] == "ck_%(table_name)s_%(constraint_name)s"
    assert convention["fk"] == "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
    assert convention["pk"] == "pk_%(table_name)s"
