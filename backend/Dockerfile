# syntax=docker/dockerfile:1.9
#
# backend/Dockerfile
#
# Build context: repo root (see .github/workflows/deploy-images.yml).
# Stage 1 installs Rust so maturin can compile the klassenzeit-solver PyO3 wheel
# during `uv sync`. Stage 2 is the same base without the Rust toolchain, keeping
# the runtime image slim.

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates pkg-config libssl-dev \
 && rm -rf /var/lib/apt/lists/* \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy workspace manifests + sources required to resolve and build the
# klassenzeit-backend package plus its workspace dependency klassenzeit-solver.
# The root Cargo.toml / Cargo.lock are required: solver-py inherits
# `[workspace.package]` from it, and maturin resolves cargo metadata against
# the workspace root, not the solver-py subdir.
COPY pyproject.toml uv.lock Cargo.toml Cargo.lock ./
COPY backend/pyproject.toml backend/pyproject.toml
COPY solver/ solver/
COPY backend/ backend/

# --no-editable installs workspace packages (klassenzeit-backend, klassenzeit-solver)
# as real wheels into the venv rather than as `.pth`-file editable installs. Editable
# entries point at source paths (/app/backend/src, /app/solver/solver-py/python) that
# do not exist in the runtime stage, so the backend would crash at import time with
# `ModuleNotFoundError: No module named 'klassenzeit_solver'`.
RUN uv sync --frozen --no-dev --no-editable --package klassenzeit-backend

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
# The wheel inside the venv carries the backend source, so we only need the
# Alembic config + migration scripts at runtime for the migrate container.
COPY backend/alembic.ini /app/backend/alembic.ini
COPY backend/alembic /app/backend/alembic

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 3001
CMD ["uvicorn", "klassenzeit_backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
