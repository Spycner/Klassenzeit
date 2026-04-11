# 0005 — Transaction-rollback test isolation

- **Status:** Accepted
- **Date:** 2026-04-11

## Context

Project rule: integration tests hit a real database, never a mock.
Given that, the question is how each test gets a clean slate.
Options include running migrations once and rolling back per test,
truncating tables between tests, or spinning up a fresh database per
test (template DB or testcontainers).

## Decision

Use the canonical SQLAlchemy "Joining a Session into an External
Transaction" pattern: a session-scoped fixture runs migrations once
(downgrade to base, upgrade to head); a per-test fixture opens a
connection, begins an outer transaction that is never committed,
creates a session bound to that connection, and starts a nested
savepoint that is automatically restarted whenever the session
commits. At teardown, the outer transaction rolls back and discards
everything.

## Alternatives considered

- **`TRUNCATE` all tables between tests.** Simpler fixture code, but
  adds 10–50 ms per test and scales linearly with the table count.
- **Fresh database per test (template DB / testcontainers).**
  Strongest isolation, but hundreds of milliseconds per test — wrong
  at this project's scale.

## Consequences

- Sub-millisecond teardown per test. TDD loop stays fast.
- Test code can call `session.commit()` and the changes still
  disappear at teardown, because the savepoint-restart listener
  keeps the session inside a transaction from the outside.
- The fixture touches one private SQLAlchemy attribute
  (`transaction._parent.nested`) because the published pattern
  requires it. If a future release moves or renames it, the fixture
  must be updated in lockstep with the new pattern from the docs.
- `pytest-xdist` parallelization is not free: each worker would need
  its own database. Deferred to OPEN_THINGS until the suite size
  makes it worthwhile.
