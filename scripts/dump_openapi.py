"""Dump the FastAPI OpenAPI schema to stdout.

Imports the app without starting a server or connecting to the database (the
engine is built in the ``lifespan`` context manager, not at import time). Safe
to run offline; used by the frontend type-generation pipeline.
"""

import json

from klassenzeit_backend.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
