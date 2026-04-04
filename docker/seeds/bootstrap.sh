#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Bootstrap script — fetches real Keycloak user IDs and provisions
# app_users + school_memberships rows in PostgreSQL.
# Idempotent: safe to run multiple times.
# ---------------------------------------------------------------------------

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

REALM="klassenzeit"
SCHOOL_ID="00000000-0000-0000-0000-000000000001"
PG_CONTAINER="klassenzeit-postgres-dev"

# ---- helpers --------------------------------------------------------------

log() { printf '[bootstrap] %s\n' "$*"; }

run_sql() {
  docker exec "$PG_CONTAINER" psql -U postgres -d klassenzeit-backend -tAc "$1"
}

# ---- 1. Wait for Keycloak to be ready ------------------------------------

log "Waiting for Keycloak at ${KEYCLOAK_URL} ..."
attempts=0
max_attempts=30
until curl -sf "${KEYCLOAK_URL}/health/ready" > /dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge "$max_attempts" ]; then
    log "ERROR: Keycloak not ready after ${max_attempts} attempts — aborting."
    exit 1
  fi
  sleep 2
done
log "Keycloak is ready."

# ---- 2. Obtain admin token ------------------------------------------------

log "Fetching admin token ..."
TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  log "ERROR: Failed to obtain admin token."
  exit 1
fi

# ---- 3. Fetch realm users --------------------------------------------------

log "Fetching users from realm '${REALM}' ..."
USERS_JSON=$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users?max=50")

# ---- 4. Provision each test user -------------------------------------------

declare -A USER_DISPLAY_NAMES=(
  ["admin@test.com"]="Admin User"
  ["teacher@test.com"]="Teacher User"
  ["viewer@test.com"]="Viewer User"
)

declare -A USER_ROLES=(
  ["admin@test.com"]="admin"
  ["teacher@test.com"]="teacher"
  ["viewer@test.com"]="viewer"
)

for email in "admin@test.com" "teacher@test.com" "viewer@test.com"; do
  display_name="${USER_DISPLAY_NAMES[$email]}"
  role="${USER_ROLES[$email]}"

  keycloak_id=$(echo "$USERS_JSON" | jq -r --arg e "$email" '.[] | select(.email == $e) | .id')

  if [ -z "$keycloak_id" ] || [ "$keycloak_id" = "null" ]; then
    log "WARNING: User ${email} not found in Keycloak — skipping."
    continue
  fi

  log "Provisioning ${email} (keycloak_id=${keycloak_id}, role=${role}) ..."

  # Insert app_users (idempotent)
  run_sql "
    INSERT INTO app_users (id, keycloak_id, email, display_name, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), '${keycloak_id}', '${email}', '${display_name}', TRUE, NOW(), NOW())
    ON CONFLICT (keycloak_id) DO NOTHING;
  "

  # Insert school_memberships (idempotent)
  run_sql "
    INSERT INTO school_memberships (id, user_id, school_id, role, is_active, created_at, updated_at)
    SELECT gen_random_uuid(), au.id, '${SCHOOL_ID}', '${role}', TRUE, NOW(), NOW()
    FROM app_users au
    WHERE au.keycloak_id = '${keycloak_id}'
      AND NOT EXISTS (
        SELECT 1 FROM school_memberships sm
        WHERE sm.user_id = au.id AND sm.school_id = '${SCHOOL_ID}'::uuid
      );
  "

  log "  -> ${email} done."
done

log "Bootstrap complete."
