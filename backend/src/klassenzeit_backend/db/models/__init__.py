"""Model re-export surface.

Every new model file must be re-exported here. Alembic's ``env.py``
imports this package so ``Base.metadata`` is populated before
``target_metadata`` is read; models not re-exported are invisible to
autogenerate.
"""

from klassenzeit_backend.db.models.user import User

__all__ = ["User"]
