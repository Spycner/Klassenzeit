"""Hessen Grundschule demo seed (stub).

Implementation lands in the next commit. This stub exists so the TDD red
tests (`backend/tests/seed/test_demo_grundschule_*.py`) can import
`seed_demo_grundschule` without tripping `ty`'s unresolved-import check
on the pre-commit gate. Tests fail at runtime with NotImplementedError,
which is still a valid red: the feature is missing.

See ``docs/superpowers/specs/2026-04-24-grundschule-seed-design.md`` for
the full design.
"""

from sqlalchemy.ext.asyncio import AsyncSession


async def seed_demo_grundschule(session: AsyncSession) -> None:
    """Seed a realistic einzügige Hessen Grundschule into ``session``.

    Not implemented in this commit; the next commit ships the real body.
    """
    raise NotImplementedError(
        "seed_demo_grundschule is a stub; the implementation lands in the next commit"
    )
