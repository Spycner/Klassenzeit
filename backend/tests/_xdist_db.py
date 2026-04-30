"""Helpers for pytest-xdist per-worker test database isolation.

Each xdist worker reads ``PYTEST_XDIST_WORKER`` (set to ``master`` if no
xdist, or ``gw0``/``gw1``/... otherwise) and operates against its own
postgres database (``klassenzeit_test_<worker>``). The helpers below are
pure with no side effects on import; the conftest does the wiring.
"""

import os
import subprocess
import sys
from pathlib import Path

import psycopg
from psycopg import sql

# Stable advisory lock key used to serialise template-database creation
# across xdist workers. Arbitrary 64-bit integer (ASCII "kznt:PP").
_TEMPLATE_LOCK_KEY: int = 0x6B7A6E743A5050


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


def drop_database_if_exists(database_url: str) -> None:
    """Forcibly drop the database referenced by ``database_url``.

    Terminates any lingering backends that hold the target open, then
    issues ``DROP DATABASE IF EXISTS``. Runs against the cluster's
    ``postgres`` admin DB in autocommit mode.
    """
    target = parse_dbname(database_url)
    with (
        psycopg.connect(admin_libpq_url(database_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (target,),
        )
        cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(target)))


def ensure_template_database(database_url: str, *, alembic_cwd: str) -> None:
    """Create and migrate the alembic template database, idempotently.

    Holds a Postgres advisory lock for the duration so concurrent xdist
    workers serialise on it. The first worker creates the template DB and
    runs ``alembic downgrade base`` then ``alembic upgrade head``;
    subsequent workers see the DB exists and only run ``upgrade head``
    (idempotent, in case alembic's head moved between runs).

    Args:
        database_url: SQLAlchemy URL of the template DB to create.
        alembic_cwd: Working directory for the alembic subprocesses
            (the ``backend/`` directory containing ``alembic.ini``).
    """
    target = parse_dbname(database_url)
    with (
        psycopg.connect(admin_libpq_url(database_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute("SELECT pg_advisory_lock(%s)", (_TEMPLATE_LOCK_KEY,))
        try:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
            fresh = cur.fetchone() is None
            if fresh:
                cur.execute(
                    sql.SQL("CREATE DATABASE {} OWNER klassenzeit").format(sql.Identifier(target))
                )
            env = os.environ.copy()
            env["KZ_DATABASE_URL"] = database_url
            steps = (
                (["downgrade", "base"], ["upgrade", "head"]) if fresh else (["upgrade", "head"],)
            )
            for args in steps:
                subprocess.run(  # noqa: S603
                    [sys.executable, "-m", "alembic", *args],
                    check=True,
                    cwd=alembic_cwd,
                    env=env,
                )
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (_TEMPLATE_LOCK_KEY,))


def clone_database_from_template(*, base_url: str, template_name: str) -> None:
    """Clone ``template_name`` into the dbname of ``base_url`` via ``CREATE DATABASE ... TEMPLATE``.

    No-op if the target database already exists. ``CREATE DATABASE …
    TEMPLATE`` rejects clones if any session is connected to the source,
    so callers must close every other connection to ``template_name``
    before invoking this helper.
    """
    target = parse_dbname(base_url)
    with (
        psycopg.connect(admin_libpq_url(base_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
        if cur.fetchone() is not None:
            return
        cur.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE {} OWNER klassenzeit").format(
                sql.Identifier(target), sql.Identifier(template_name)
            )
        )
