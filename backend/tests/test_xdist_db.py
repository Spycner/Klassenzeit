"""Unit tests for backend/tests/_xdist_db.py."""

from pathlib import Path

import pytest

from tests._xdist_db import (
    admin_libpq_url,
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
