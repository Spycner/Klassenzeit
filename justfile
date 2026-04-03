# Load dev environment by default
set dotenv-filename := ".env.dev"

# Development
dev:
    docker compose up -d --build

dev-stop:
    docker compose down

dev-logs:
    docker compose logs -f

# Backend
backend-test:
    cargo test --workspace
    cargo test -p klassenzeit-backend --test mod

backend-check:
    cargo fmt --check --all && cargo clippy --workspace -- -D warnings

backend-fmt:
    cargo fmt --all

# Frontend
frontend-dev:
    cd frontend && bun run dev

frontend-test:
    cd frontend && bun test

frontend-check:
    cd frontend && bun run check && bun run typecheck

frontend-fmt:
    cd frontend && bun run check:fix

# All tests
test: backend-test frontend-test

# All checks (what CI runs)
check: backend-check frontend-check

# Docs
docs-build:
    mdbook build docs/

docs-serve:
    mdbook serve docs/

# Staging
staging-deploy:
    docker compose -f docker-compose.staging.yml up -d --build

staging-stop:
    docker compose -f docker-compose.staging.yml down

# Production
prod-deploy:
    docker compose -f docker-compose.prod.yml up -d --build

prod-stop:
    docker compose -f docker-compose.prod.yml down

# Database
db-migrate:
    cd backend && cargo run -- db migrate

db-reset:
    cd backend && cargo run -- db reset

# Reset dev environment (wipe volumes and start fresh)
dev-reset:
    docker compose down -v
    docker compose up -d
