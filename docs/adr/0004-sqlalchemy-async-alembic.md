# 0004 — SQLAlchemy 2.0 async plus Alembic

- **Status:** Accepted
- **Date:** 2026-04-11

## Context

We need an ORM and a migration tool for the Python backend. FastAPI
routes are async, so the DB layer should be async-native. Options
range from the gold-standard SQLAlchemy to more opinionated
frameworks (SQLModel, Piccolo, Tortoise ORM).

## Decision

Use SQLAlchemy 2.0 in async mode (`asyncpg` driver) with Alembic for
migrations. Models use the 2.0 typed API (`Mapped[...]`,
`mapped_column`). A single `DeclarativeBase` subclass with a stable
`MetaData(naming_convention=...)` ensures constraint names don't
drift across environments.

## Alternatives considered

- **SQLModel.** Rejected because its "one class for table + DTO"
  pitch erodes the moment you need different shapes for read vs
  write. Static-checker support is thinner than SQLAlchemy proper,
  and it moves slower.
- **Piccolo.** Async-native with built-in migrations and a smaller
  API surface, but the ecosystem is smaller and the escape hatches
  are less well-trodden.
- **Tortoise ORM.** Similar to Piccolo. Rejected for the same
  ecosystem-size reason.
- **Hand-rolled SQL.** Rejected because query construction,
  parameter binding, and schema introspection are well solved
  problems and we have better things to build.

## Consequences

- More boilerplate than SQLModel, but the verbosity buys longevity,
  type safety, and an escape hatch for every weird query we will
  eventually need.
- Alembic is the canonical migration tool for SQLAlchemy — one less
  thing to justify.
- The 2.0 typed API plays well with `ty` and future editor tooling.
- Future migration to something else means rewriting every model,
  but the probability of that is low.
