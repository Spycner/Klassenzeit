# Deployment (staging)

Runbook for the `klassenzeit-staging.pascalkraus.com` environment on the
Hetzner VPS. The Caddyfile already routes the hostname to
`klassenzeit-backend-staging:3001` and `klassenzeit-frontend-staging:3000`
on the shared `web` Docker network; this directory supplies the services
that answer those names.

## What is here

- `compose.yaml`, three-service compose (migrate, backend, frontend) that
  joins the external `web` network.
- `.env.staging.example`, env template. The real `.env.staging` lives on
  the VPS in `/home/pascal/kz-deploy/` and never enters git.

## First-time setup (per VPS)

Pre-requisites already in place on the VPS and not repeated here:
- Caddy, Postgres, and Keycloak running from `/home/pascal/Code/server-infra/`.
- Cloudflare DNS A record for `klassenzeit-staging` pointing at the VPS.
- The shared Postgres container is named `postgres` on the `web` network.

1. **Copy deploy assets to the VPS.** From your laptop:

   ```bash
   ssh pascal@<VPS> 'mkdir -p /home/pascal/kz-deploy'
   scp deploy/compose.yaml pascal@<VPS>:/home/pascal/kz-deploy/compose.yaml
   scp deploy/.env.staging.example pascal@<VPS>:/home/pascal/kz-deploy/.env.staging
   ```

   Or use the ttyd shell at https://term.pascalkraus.com to `cat >` each file.

2. **Bootstrap the Postgres role and database.** On the VPS, read the
   superuser credentials from `/home/pascal/Code/server-infra/.env.local`,
   then create the Klassenzeit staging role and DB on the running shared
   Postgres:

   ```bash
   cd /home/pascal/Code/server-infra
   source .env.local  # POSTGRES_USER and POSTGRES_PASSWORD
   STAGING_PW=$(openssl rand -base64 24)
   docker exec -i postgres psql -U "$POSTGRES_USER" <<SQL
   CREATE ROLE klassenzeit_staging LOGIN PASSWORD '${STAGING_PW}';
   CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging;
   SQL
   echo "Generated staging password (paste into .env.staging): ${STAGING_PW}"
   ```

   Copy the printed password into
   `/home/pascal/kz-deploy/.env.staging` by replacing `REPLACE_ME` in
   `KZ_DATABASE_URL`.

3. **Make sure GHCR images are pullable.** On first deploy the images may
   be private. Options:
   - (a) On GitHub, open each package page
     (`github.com/pgoell/Klassenzeit/pkgs/container/klassenzeit-backend`,
     likewise for frontend) and change visibility to Public.
   - (b) On the VPS, log docker in with a PAT that has `read:packages`:
     `docker login ghcr.io -u pgoell -p <PAT>`.

4. **First pull + up.**

   ```bash
   cd /home/pascal/kz-deploy
   docker compose pull
   docker compose up -d
   ```

   The migrate container runs once and exits; backend and frontend come up
   behind the existing Caddy. Verify:

   ```bash
   curl -fsS https://klassenzeit-staging.pascalkraus.com/health
   # expected: {"status":"ok","solver_check":"ko"}
   curl -fsS https://klassenzeit-staging.pascalkraus.com/ | head -c 200
   # expected: HTML starting with <!doctype html>...
   ```

## Per-deploy update

After a master push triggers the `deploy-images.yml` workflow, SSH into
the VPS (or open ttyd) and run:

```bash
cd /home/pascal/kz-deploy
docker compose pull
docker compose up -d
```

`docker compose up -d` recreates only containers whose images changed.
The migrate service runs again and exits before the backend restarts.

## Rollback

Published images are tagged with both `latest` and `sha-<short>`. To go
back to a known-good commit:

```bash
cd /home/pascal/kz-deploy
sed -i 's/^KZ_IMAGE_TAG=.*/KZ_IMAGE_TAG=sha-abcdef1/' .env.staging
docker compose pull
docker compose up -d
```

Replace `abcdef1` with the short SHA of the target commit. Confirm with
`docker inspect klassenzeit-backend-staging --format '{{.Image}}'`.

## Logs and troubleshooting

```bash
# Tail live logs (backend / frontend).
docker compose logs -f klassenzeit-backend-staging
docker compose logs -f klassenzeit-frontend-staging

# Inspect the one-shot migration run.
docker compose logs klassenzeit-migrate-staging

# Check health and network attachment.
docker inspect klassenzeit-backend-staging \
  --format '{{.State.Health.Status}} on {{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'
```

If migration fails: the backend container will not start because
`depends_on.condition: service_completed_successfully` is unmet. Re-run
`docker compose up -d` after fixing the underlying issue (usually a DB
role or a bad `KZ_DATABASE_URL`).

## Local smoke test

To sanity-check the compose before deploying:

```bash
# One-time: create a local `web` network so compose's external reference resolves.
podman network create web 2>/dev/null || true

# Start a local Postgres on the web network with a throwaway role.
podman run --name kz-pg-smoke -d --network web \
  -e POSTGRES_USER=klassenzeit_staging \
  -e POSTGRES_PASSWORD=smoke \
  -e POSTGRES_DB=klassenzeit_staging \
  docker.io/library/postgres:17

# Point an override env file at the local DB.
cat > /tmp/.env.smoke <<EOF
KZ_IMAGE_TAG=latest
KZ_DATABASE_URL=postgresql+psycopg://klassenzeit_staging:smoke@kz-pg-smoke:5432/klassenzeit_staging
KZ_ENV=prod
KZ_COOKIE_SECURE=false
KZ_DB_POOL_SIZE=5
KZ_DB_MAX_OVERFLOW=10
KZ_DB_ECHO=false
EOF

# Start; note: uses published images, so you must have pushed at least once.
cp /tmp/.env.smoke deploy/.env.staging
podman compose -f deploy/compose.yaml up
```

Tear down with `podman compose -f deploy/compose.yaml down && podman rm -f kz-pg-smoke`.
Do NOT commit `deploy/.env.staging`. The `.gitignore` rule in this repo blocks it, but double-check before committing unrelated deploy changes.
