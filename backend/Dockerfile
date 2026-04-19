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
COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/pyproject.toml
COPY solver/ solver/
COPY backend/ backend/

RUN uv sync --frozen --no-dev --package klassenzeit-backend

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY backend/ /app/backend/

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 3001
CMD ["uvicorn", "klassenzeit_backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
