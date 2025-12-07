# Klassenzeit

A timetabler application for schools.

## Quick Start

```bash
make dev    # Start services (PostgreSQL + Keycloak) and backend
```

Run `make help` to see all available commands.

## Prerequisites

- Java 21
- Docker Desktop
- Node.js (for frontend and e2e tests)
- uv (Python package manager, for pre-commit hooks)

## Development Setup

```bash
# Install pre-commit hooks
uv sync --extra dev
uv run pre-commit install

# Start services (PostgreSQL + Keycloak)
make services-up

# Start backend (in one terminal)
make dev

# Start frontend (in another terminal)
make frontend
```

## Environment Variables

The project uses environment variables for configuration. Copy the `.env.example` files to `.env` in each directory.

### Root (`.env`)

Database configuration for Docker Compose:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | `klassenzeit` |
| `POSTGRES_USER` | Database user | `klassenzeit` |
| `POSTGRES_PASSWORD` | Database password | - |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8080` |

### E2E Tests (`e2e/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | API URL for integration tests | `http://localhost:8080/api` |

## Testing

```bash
make test           # Run all unit tests
make test-e2e       # Run E2E tests (requires services running)
```

## Project Structure

```
├── backend/        # Spring Boot application
├── frontend/       # React frontend
├── e2e/            # End-to-end tests (Playwright)
└── tasks/          # Project task tracking
```
