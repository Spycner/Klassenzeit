"""Helpers for pytest-xdist per-worker test database isolation.

Each xdist worker reads ``PYTEST_XDIST_WORKER`` (set to ``master`` if no
xdist, or ``gw0``/``gw1``/... otherwise) and operates against its own
postgres database (``klassenzeit_test_<worker>``). The helpers below are
pure with no side effects on import; the conftest does the wiring.
"""

from pathlib import Path

import psycopg
from psycopg import sql


def read_env_test_database_url(env_test_path: Path) -> str:
    """Read ``KZ_DATABASE_URL`` from a ``.env.test``-style file.

    Args:
        env_test_path: Path to the dotenv file.

    Returns:
        The verbatim value (no quote-stripping; the project's ``.env.test``
        does not quote values).

    Raises:
        RuntimeError: if the key is absent.
    """
    for raw in env_test_path.read_text().splitlines():
        line = raw.strip()
        if line.startswith("KZ_DATABASE_URL="):
            return line.partition("=")[2]
    raise RuntimeError(f"KZ_DATABASE_URL not found in {env_test_path}")


def worker_database_url(base_url: str, worker: str) -> str:
    """Apply the per-worker suffix to a SQLAlchemy database URL.

    ``master`` (or unset) returns the URL unchanged. Any other value
    appends ``_<worker>`` to the dbname segment.
    """
    if worker == "master":
        return base_url
    return f"{base_url}_{worker}"


def parse_dbname(database_url: str) -> str:
    """Return the database name from a SQLAlchemy postgres URL."""
    return database_url.rsplit("/", 1)[1]


def admin_libpq_url(database_url: str) -> str:
    """Derive a libpq URL pointing at the ``postgres`` admin DB.

    Strips the SQLAlchemy ``+psycopg`` dialect tag and replaces the dbname
    segment with ``postgres`` so psycopg can run admin DDL (CREATE
    DATABASE, etc.) against the cluster.
    """
    head, _, _ = database_url.rpartition("/")
    libpq_head = head.replace("postgresql+psycopg://", "postgresql://", 1)
    return f"{libpq_head}/postgres"


def ensure_database_exists(database_url: str) -> None:
    """Idempotently create the database referenced by ``database_url``.

    Connects to the cluster's ``postgres`` DB in autocommit mode and
    issues ``CREATE DATABASE`` only if the target is absent. Safe to call
    on every session; cheap when the DB already exists (single
    ``SELECT`` round-trip).
    """
    target = parse_dbname(database_url)
    with (
        psycopg.connect(admin_libpq_url(database_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (target,),
        )
        if cur.fetchone() is None:
            cur.execute(
                sql.SQL("CREATE DATABASE {} OWNER klassenzeit").format(sql.Identifier(target))
            )
