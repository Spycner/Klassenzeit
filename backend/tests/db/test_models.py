"""Tests for the model re-export surface and model metadata."""

from sqlalchemy import Boolean, DateTime, String

from klassenzeit_backend.db.base import Base
from klassenzeit_backend.db.models import User


def test_user_model_is_registered_on_metadata() -> None:
    assert "users" in Base.metadata.tables


def test_user_has_expected_columns() -> None:
    table = Base.metadata.tables["users"]

    id_col = table.c["id"]
    assert id_col.primary_key

    email_col = table.c["email"]
    assert email_col.unique
    assert isinstance(email_col.type, String)
    assert email_col.type.length == 320

    hash_col = table.c["password_hash"]
    assert isinstance(hash_col.type, String)
    assert hash_col.type.length == 256

    role_col = table.c["role"]
    assert isinstance(role_col.type, String)

    active_col = table.c["is_active"]
    assert isinstance(active_col.type, Boolean)

    force_col = table.c["force_password_change"]
    assert isinstance(force_col.type, Boolean)

    login_col = table.c["last_login_at"]
    assert isinstance(login_col.type, DateTime)
    assert login_col.type.timezone is True
    assert login_col.nullable is True

    created_col = table.c["created_at"]
    assert isinstance(created_col.type, DateTime)
    assert created_col.type.timezone is True
    assert created_col.server_default is not None

    updated_col = table.c["updated_at"]
    assert isinstance(updated_col.type, DateTime)
    assert updated_col.type.timezone is True
    assert updated_col.server_default is not None


def test_user_is_importable_from_models_package() -> None:
    assert User.__tablename__ == "users"
