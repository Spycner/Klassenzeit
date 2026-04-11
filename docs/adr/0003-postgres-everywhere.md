# 0003 — Postgres everywhere

- **Status:** Accepted
- **Date:** 2026-04-11

## Context

The backend needs a database. Choosing different engines for dev,
test, and production is attractive for onboarding friction (SQLite
has zero setup) but bites hard at exactly the points that matter
most — migrations, JSON columns, concurrency behavior, timezone
handling, `ON CONFLICT` semantics.

## Decision

Use Postgres 17 in every environment: local dev, pytest, and
production. A single `compose.yaml` at the repo root defines the dev
Postgres service and runs it via `podman compose`. The test database
(`klassenzeit_test`) lives in the same Postgres instance as the dev
database (`klassenzeit_dev`), created by an init script on first
boot.

## Alternatives considered

- **SQLite in dev and tests, Postgres in prod.** Rejected because
  the SQLAlchemy abstraction leaks at migration time, JSON column
  support differs, and "works on my machine, breaks on Postgres"
  becomes a recurring failure mode.
- **SQLite everywhere.** Rejected because scheduling is a
  concurrent-write workload and SQLite's single-writer model is a
  dead end at any real scale.

## Consequences

- Contributors need `podman` and the DB container running. Mitigated
  by `mise run db:up` and healthchecks in the compose file. One
  `mise install` + `mise run install` + `mise run db:up` still
  onboards in under two minutes.
- Test runs require the DB container. CI must provision a Postgres
  service (tracked in OPEN_THINGS).
- No SQLAlchemy dialect branching in the codebase.
