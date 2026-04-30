"""Unit tests for backend/tests/_xdist_db.py."""

import os
import uuid as _uuid
from pathlib import Path

import psycopg
import pytest

from tests._xdist_db import (
    admin_libpq_url,
    clone_database_from_template,
    drop_database_if_exists,
    ensure_template_database,
    parse_dbname,
    read_env_test_database_url,
    worker_database_url,
)


def test_worker_database_url_master_returns_unchanged():
    base = "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test"
    assert worker_database_url(base, "master") == base


def test_worker_database_url_suffixes_with_worker_name():
    base = "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test"
    expected = "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test_gw0"
    assert worker_database_url(base, "gw0") == expected


def test_parse_dbname_extracts_trailing_segment():
    assert (
        parse_dbname(
            "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test_gw3"
        )
        == "klassenzeit_test_gw3"
    )


def test_admin_libpq_url_swaps_dialect_and_dbname():
    src = "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test_gw0"
    expected = "postgresql://klassenzeit:klassenzeit@localhost:5433/postgres"
    assert admin_libpq_url(src) == expected


def test_read_env_test_database_url_finds_key(tmp_path: Path):
    env = tmp_path / ".env.test"
    env.write_text("# comment\nKZ_DATABASE_URL=postgresql+psycopg://u:p@h:5433/db\nKZ_ENV=test\n")
    assert read_env_test_database_url(env) == "postgresql+psycopg://u:p@h:5433/db"


def test_read_env_test_database_url_raises_when_missing(tmp_path: Path):
    env = tmp_path / ".env.test"
    env.write_text("KZ_ENV=test\n")
    with pytest.raises(RuntimeError, match="KZ_DATABASE_URL not found"):
        read_env_test_database_url(env)


def test_template_workflow_creates_clone_with_same_alembic_head() -> None:
    """Round-trip the template helper against the local Postgres."""
    backend_root = Path(__file__).resolve().parent.parent
    raw_url = os.environ.get("KZ_DATABASE_URL") or read_env_test_database_url(
        backend_root / ".env.test"
    )
    # Strip any per-worker suffix (gw0/gw1/...) so we test against the base URL.
    base_url = raw_url.rsplit("_", 1)[0] if raw_url.rsplit("_", 1)[-1].startswith("gw") else raw_url
    suffix = _uuid.uuid4().hex[:8]
    template_url = f"{base_url}_template_{suffix}"
    clone_url = f"{base_url}_clone_{suffix}"
    template_name = template_url.rsplit("/", 1)[1]
    clone_name = clone_url.rsplit("/", 1)[1]

    try:
        ensure_template_database(template_url, alembic_cwd=str(backend_root))
        clone_database_from_template(base_url=clone_url, template_name=template_name)
        with (
            psycopg.connect(admin_libpq_url(clone_url), autocommit=True) as conn,
            conn.cursor() as cur,
        ):
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (clone_name,))
            assert cur.fetchone() is not None
    finally:
        drop_database_if_exists(clone_url)
        drop_database_if_exists(template_url)
