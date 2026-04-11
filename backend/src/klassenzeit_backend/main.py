"""FastAPI entry point for the Klassenzeit backend."""

from fastapi import FastAPI

from klassenzeit_solver import reverse_chars  # ty: ignore[unresolved-import]

app = FastAPI(title="Klassenzeit")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
