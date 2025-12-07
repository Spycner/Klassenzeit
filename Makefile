.PHONY: help dev dev-all services-up services-down services-logs services-reset db-docs backend frontend test test-backend test-frontend test-frontend-coverage test-e2e test-e2e-ui test-a11y lint lint-backend lint-frontend format format-backend format-frontend pre-commit clean

# Default target
help:
	@echo "Klassenzeit Development Commands"
	@echo ""
	@echo "Services (PostgreSQL + Keycloak):"
	@echo "  make services-up     Start PostgreSQL and Keycloak"
	@echo "  make services-down   Stop PostgreSQL and Keycloak"
	@echo "  make services-logs   Show service logs"
	@echo "  make services-reset  Reset all services (destroy and recreate)"
	@echo ""
	@echo "Database:"
	@echo "  make db-docs         Generate database documentation with ER diagrams"
	@echo ""
	@echo "Development:"
	@echo "  make dev             Start services and backend"
	@echo "  make backend      Run backend only"
	@echo "  make frontend     Run frontend only"
	@echo ""
	@echo "Testing:"
	@echo "  make test                  Run all unit tests (backend + frontend)"
	@echo "  make test-backend          Run backend tests"
	@echo "  make test-frontend         Run frontend unit tests"
	@echo "  make test-frontend-coverage Run frontend tests with coverage"
	@echo "  make test-e2e              Run E2E tests (requires running services)"
	@echo "  make test-e2e-ui           Run E2E tests with Playwright UI"
	@echo "  make test-a11y             Run accessibility tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         Check all linting"
	@echo "  make lint-backend Check backend linting"
	@echo "  make lint-frontend Check frontend linting"
	@echo "  make format       Format all code"
	@echo "  make format-backend Format backend code"
	@echo "  make format-frontend Format frontend code"
	@echo "  make pre-commit   Run pre-commit hooks on all files"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        Clean build artifacts"

# Services (PostgreSQL + Keycloak)
services-up:
	docker compose up -d

services-down:
	docker compose down

services-logs:
	docker compose logs -f

services-reset:
	docker compose down -v
	docker compose up -d

# Database
db-docs:
	@mkdir -p backend/build/schemaspy
	docker run --rm --network=host \
		-v $(PWD)/backend/build/schemaspy:/output \
		schemaspy/schemaspy:latest \
		-t pgsql -host localhost -port 5432 \
		-db klassenzeit -u klassenzeit -p klassenzeit
	@echo "Documentation generated at backend/build/schemaspy/index.html"
	@open backend/build/schemaspy/index.html 2>/dev/null || xdg-open backend/build/schemaspy/index.html 2>/dev/null || echo "Open backend/build/schemaspy/index.html in your browser"

# Development
dev: services-up backend

backend:
	@set -a && [ -f .env ] && . ./.env; set +a && cd backend && ./gradlew bootRun

frontend:
	cd frontend && npm run dev

# Testing
test: test-backend test-frontend

test-backend:
	cd backend && ./gradlew test

test-frontend:
	cd frontend && npm run test

test-frontend-coverage:
	cd frontend && npm run test:coverage

test-e2e:
	cd e2e && npm test

test-e2e-ui:
	cd e2e && npm run test:ui

test-a11y:
	cd e2e && npm run test:a11y

# Code Quality
lint: lint-backend lint-frontend

lint-backend:
	cd backend && ./gradlew spotlessCheck checkstyleMain checkstyleTest pmdMain pmdTest spotbugsMain spotbugsTest

lint-frontend:
	cd frontend && npm run check

format: format-backend format-frontend

format-backend:
	cd backend && ./gradlew spotlessApply

format-frontend:
	cd frontend && npm run format

pre-commit:
	uv run pre-commit run --all-files

# Cleanup
clean:
	cd backend && ./gradlew clean
	rm -rf frontend/dist frontend/node_modules/.vite frontend/coverage
	rm -rf e2e/playwright-report e2e/test-results
