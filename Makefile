.PHONY: help dev dev-all db-up db-down db-logs db-reset db-docs backend frontend test test-backend lint lint-backend lint-frontend format format-backend format-frontend clean

# Default target
help:
	@echo "Klassenzeit Development Commands"
	@echo ""
	@echo "Database:"
	@echo "  make db-up        Start PostgreSQL database"
	@echo "  make db-down      Stop PostgreSQL database"
	@echo "  make db-logs      Show database logs"
	@echo "  make db-reset     Reset database (destroy and recreate)"
	@echo "  make db-docs      Generate database documentation with ER diagrams"
	@echo ""
	@echo "Development:"
	@echo "  make dev          Start database and backend"
	@echo "  make backend      Run backend only"
	@echo "  make frontend     Run frontend only"
	@echo ""
	@echo "Testing:"
	@echo "  make test         Run all tests"
	@echo "  make test-backend Run backend tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         Check all linting"
	@echo "  make lint-backend Check backend linting"
	@echo "  make lint-frontend Check frontend linting"
	@echo "  make format       Format all code"
	@echo "  make format-backend Format backend code"
	@echo "  make format-frontend Format frontend code"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        Clean build artifacts"

# Database
db-up:
	podman-compose up -d

db-down:
	podman-compose down

db-logs:
	podman-compose logs -f

db-reset:
	podman-compose down -v
	podman-compose up -d

db-docs:
	@mkdir -p backend/build/schemaspy
	podman run --rm --network=host \
		-v $(PWD)/backend/build/schemaspy:/output \
		schemaspy/schemaspy:latest \
		-t pgsql -host localhost -port 5432 \
		-db klassenzeit -u klassenzeit -p klassenzeit
	@echo "Documentation generated at backend/build/schemaspy/index.html"
	@open backend/build/schemaspy/index.html 2>/dev/null || xdg-open backend/build/schemaspy/index.html 2>/dev/null || echo "Open backend/build/schemaspy/index.html in your browser"

# Development
dev: db-up backend

backend:
	cd backend && ./gradlew bootRun

frontend:
	cd frontend && npm run dev

# Testing
test: test-backend

test-backend:
	cd backend && ./gradlew test

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

# Cleanup
clean:
	cd backend && ./gradlew clean
	rm -rf frontend/dist frontend/node_modules/.vite
