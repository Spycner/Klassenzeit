# G-011: Production Deployment Setup

## Description

Create production-ready Docker Compose configuration with Caddy reverse proxy for self-hosted deployment (e.g., Hetzner VPS). This enables easy deployment with automatic SSL and all services running in containers.

## Acceptance Criteria

- [ ] Create `docker-compose.prod.yml` with:
  - [ ] Spring Boot backend service
  - [ ] PostgreSQL database with persistent volume
  - [ ] Frontend served via Caddy
  - [ ] Caddy reverse proxy with automatic SSL
- [ ] Create `Caddyfile` for routing and SSL
- [ ] Create `Dockerfile` for frontend (build + serve static files)
- [ ] Create `.env.prod.example` with production environment variables
- [ ] Add deployment documentation to README or separate DEPLOY.md

## Technical Details

### Architecture
```
                    ┌─────────────────────────────────────┐
                    │           Hetzner VPS              │
                    │                                     │
  HTTPS :443 ──────►│  ┌─────────┐                       │
                    │  │  Caddy  │ ──► /api/* ──► :8080  │
                    │  │  :80    │                       │
                    │  │  :443   │ ──► /* ──► static     │
                    │  └─────────┘                       │
                    │       │                            │
                    │       ▼                            │
                    │  ┌──────────┐    ┌─────────────┐  │
                    │  │ Backend  │───►│ PostgreSQL  │  │
                    │  │  :8080   │    │   :5432     │  │
                    │  └──────────┘    └─────────────┘  │
                    └─────────────────────────────────────┘
```

### docker-compose.prod.yml structure
```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./frontend/dist:/srv
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend

  backend:
    build: ./backend
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - DATABASE_URL=jdbc:postgresql://db:5432/klassenzeit
    depends_on:
      - db

  db:
    image: postgres:17-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=klassenzeit
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

### Caddyfile example
```
{$DOMAIN:localhost} {
    # API proxy
    handle /api/* {
        reverse_proxy backend:8080
    }

    # Static frontend
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
}
```

### Deployment steps
1. Clone repo on server
2. Copy `.env.prod.example` to `.env` and configure
3. Build frontend: `npm run build`
4. Run: `docker compose -f docker-compose.prod.yml up -d`

## Dependencies

- Existing Docker Compose for development
- Backend Dockerfile (may need production optimizations)

## Notes

### Security considerations
- Database not exposed externally
- Environment variables for secrets
- Caddy handles SSL automatically via Let's Encrypt
- Consider adding rate limiting in Caddy

### Optional enhancements (future)
- GitHub Actions for CI/CD
- Database backups
- Health check endpoints
- Monitoring (Prometheus/Grafana)
