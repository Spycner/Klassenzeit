# Keycloak Realm Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the `klassenzeit` Keycloak realm across dev, staging, and prod with roles, JWT mappers, and seed users.

**Architecture:** Dev uses a local Keycloak container with a realm JSON imported on startup. Staging/prod use a shared Keycloak at `https://klassenzeit-auth.pascalkraus.com`, configured via an idempotent Admin REST API shell script.

**Tech Stack:** Keycloak 26.0, Docker Compose, Keycloak Admin REST API (curl), bash

---

### Task 1: Create dev realm export JSON

**Files:**
- Create: `docker/keycloak/klassenzeit-realm.json`

This is the full realm configuration imported by the dev Keycloak container on startup. Based on the v1 export structure from `archive/v1:docker/keycloak/klassenzeit-realm.json` but updated for v2 requirements.

- [ ] **Step 1: Create the realm JSON file**

Write `docker/keycloak/klassenzeit-realm.json` with this content:

```json
{
  "realm": "klassenzeit",
  "enabled": true,
  "sslRequired": "none",
  "registrationAllowed": false,
  "registrationEmailAsUsername": true,
  "rememberMe": true,
  "verifyEmail": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "editUsernameAllowed": false,
  "bruteForceProtected": false,
  "internationalizationEnabled": true,
  "supportedLocales": ["de", "en"],
  "defaultLocale": "de",
  "accessTokenLifespan": 300,
  "ssoSessionIdleTimeout": 1800,
  "roles": {
    "realm": [
      {
        "name": "admin",
        "description": "Full access — manage school settings and members"
      },
      {
        "name": "teacher",
        "description": "View and edit timetables for their school"
      },
      {
        "name": "viewer",
        "description": "Read-only access to timetables"
      }
    ]
  },
  "clients": [
    {
      "clientId": "klassenzeit-dev",
      "name": "Klassenzeit Dev",
      "description": "Klassenzeit development SPA client",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": false,
      "protocol": "openid-connect",
      "rootUrl": "http://localhost:3000",
      "baseUrl": "/",
      "redirectUris": ["http://localhost:3000/*"],
      "webOrigins": ["http://localhost:3000"],
      "attributes": {
        "post.logout.redirect.uris": "http://localhost:3000/*",
        "pkce.code.challenge.method": "S256"
      },
      "defaultClientScopes": [
        "openid",
        "web-origins",
        "acr",
        "basic",
        "profile",
        "email"
      ],
      "optionalClientScopes": [
        "address",
        "phone",
        "offline_access"
      ],
      "protocolMappers": [
        {
          "name": "school_id",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "consentRequired": false,
          "config": {
            "user.attribute": "school_id",
            "claim.name": "school_id",
            "jsonType.label": "String",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "multivalued": "false"
          }
        },
        {
          "name": "realm_roles",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-realm-role-mapper",
          "consentRequired": false,
          "config": {
            "claim.name": "role",
            "jsonType.label": "String",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "multivalued": "true"
          }
        }
      ]
    }
  ],
  "users": [
    {
      "username": "admin@test.com",
      "email": "admin@test.com",
      "emailVerified": true,
      "enabled": true,
      "firstName": "Admin",
      "lastName": "User",
      "attributes": {
        "school_id": ["00000000-0000-0000-0000-000000000001"]
      },
      "credentials": [
        {
          "type": "password",
          "value": "test1234",
          "temporary": false
        }
      ],
      "realmRoles": ["admin"]
    },
    {
      "username": "teacher@test.com",
      "email": "teacher@test.com",
      "emailVerified": true,
      "enabled": true,
      "firstName": "Teacher",
      "lastName": "User",
      "attributes": {
        "school_id": ["00000000-0000-0000-0000-000000000001"]
      },
      "credentials": [
        {
          "type": "password",
          "value": "test1234",
          "temporary": false
        }
      ],
      "realmRoles": ["teacher"]
    },
    {
      "username": "viewer@test.com",
      "email": "viewer@test.com",
      "emailVerified": true,
      "enabled": true,
      "firstName": "Viewer",
      "lastName": "User",
      "attributes": {
        "school_id": ["00000000-0000-0000-0000-000000000001"]
      },
      "credentials": [
        {
          "type": "password",
          "value": "test1234",
          "temporary": false
        }
      ],
      "realmRoles": ["viewer"]
    }
  ],
  "browserSecurityHeaders": {
    "contentSecurityPolicyReportOnly": "",
    "xContentTypeOptions": "nosniff",
    "referrerPolicy": "no-referrer",
    "xRobotsTag": "none",
    "xFrameOptions": "SAMEORIGIN",
    "contentSecurityPolicy": "frame-src 'self'; frame-ancestors 'self'; object-src 'none';",
    "xXSSProtection": "1; mode=block",
    "strictTransportSecurity": "max-age=31536000; includeSubDomains"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add docker/keycloak/klassenzeit-realm.json
git commit -m "Add dev Keycloak realm export with roles, mappers, and seed users"
```

---

### Task 2: Update docker-compose.yml to import realm on startup

**Files:**
- Modify: `docker-compose.yml` (keycloak-dev service, lines 15-30)

The dev Keycloak container needs to mount the realm JSON and import it on first boot.

- [ ] **Step 1: Update keycloak-dev service**

In `docker-compose.yml`, modify the `keycloak-dev` service to:
1. Change `command` from `start-dev` to `start-dev --import-realm`
2. Add a volume mount for the realm JSON
3. Add a dedicated Keycloak database (separate from the app DB) so realm data persists independently

Replace the existing `keycloak-dev` service block (lines 15-30):

```yaml
  keycloak-dev:
    image: quay.io/keycloak/keycloak:26.0
    container_name: klassenzeit-keycloak-dev
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-dev:5432/klassenzeit_dev
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: dev_password
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    volumes:
      - ./docker/keycloak/klassenzeit-realm.json:/opt/keycloak/data/import/klassenzeit-realm.json:ro
    ports:
      - "8080:8080"
    depends_on:
      - postgres-dev
    restart: unless-stopped
```

Key change: `--import-realm` tells Keycloak to import any JSON files found in `/opt/keycloak/data/import/` on startup. The `:ro` mount makes it read-only. The import is idempotent — if the realm already exists, Keycloak skips the import.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "Configure dev Keycloak to import realm on startup"
```

---

### Task 3: Test dev realm import

**Files:** None (verification only)

Verify that the dev Keycloak container starts and imports the realm correctly.

- [ ] **Step 1: Start the dev Keycloak stack**

```bash
docker compose up -d postgres-dev keycloak-dev
```

Wait for Keycloak to be healthy (takes ~15-30 seconds):

```bash
until curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; do sleep 2; done
echo "Keycloak is ready"
```

- [ ] **Step 2: Verify realm exists**

```bash
# Get admin token
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  | jq -r '.access_token')

# Check realm
curl -s "http://localhost:8080/admin/realms/klassenzeit" \
  -H "Authorization: Bearer $TOKEN" | jq '{realm: .realm, enabled: .enabled}'
```

Expected output:
```json
{
  "realm": "klassenzeit",
  "enabled": true
}
```

- [ ] **Step 3: Verify client exists**

```bash
curl -s "http://localhost:8080/admin/realms/klassenzeit/clients?clientId=klassenzeit-dev" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {clientId: .clientId, publicClient: .publicClient, directAccessGrantsEnabled: .directAccessGrantsEnabled}'
```

Expected output:
```json
{
  "clientId": "klassenzeit-dev",
  "publicClient": true,
  "directAccessGrantsEnabled": true
}
```

- [ ] **Step 4: Verify roles exist**

```bash
curl -s "http://localhost:8080/admin/realms/klassenzeit/roles" \
  -H "Authorization: Bearer $TOKEN" | jq '[.[] | select(.name == "admin" or .name == "teacher" or .name == "viewer") | .name]'
```

Expected output:
```json
["admin", "teacher", "viewer"]
```

- [ ] **Step 5: Verify seed users and JWT claims**

Test the full token flow by logging in as a seed user and inspecting the JWT:

```bash
# Login as admin@test.com via direct access grant
USER_TOKEN=$(curl -s -X POST "http://localhost:8080/realms/klassenzeit/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@test.com&password=test1234&grant_type=password&client_id=klassenzeit-dev" \
  | jq -r '.access_token')

# Decode the JWT payload (middle segment) and check claims
echo "$USER_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{school_id: .school_id, role: .role, email: .email}'
```

Expected output:
```json
{
  "school_id": "00000000-0000-0000-0000-000000000001",
  "role": ["admin"],
  "email": "admin@test.com"
}
```

Also verify teacher and viewer:

```bash
for user in teacher@test.com viewer@test.com; do
  T=$(curl -s -X POST "http://localhost:8080/realms/klassenzeit/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$user&password=test1234&grant_type=password&client_id=klassenzeit-dev" \
    | jq -r '.access_token')
  echo "$user:"
  echo "$T" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{school_id: .school_id, role: .role}'
done
```

Expected: each user has `school_id: "00000000-0000-0000-0000-000000000001"` and their respective role.

- [ ] **Step 6: Stop dev containers**

```bash
docker compose down
```

---

### Task 4: Create staging/prod setup script

**Files:**
- Create: `docker/keycloak/setup-realm.sh`

An idempotent bash script that configures the `klassenzeit` realm on the shared Keycloak instance via the Admin REST API. Safe to re-run — checks for existing resources before creating.

- [ ] **Step 1: Create the setup script**

Write `docker/keycloak/setup-realm.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./docker/keycloak/setup-realm.sh <environment>
# Environments: staging, prod
# Requires: KEYCLOAK_ADMIN_URL, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD env vars

ENV="${1:-}"
if [[ -z "$ENV" || ! "$ENV" =~ ^(staging|prod)$ ]]; then
  echo "Usage: $0 <staging|prod>"
  exit 1
fi

KEYCLOAK_URL="${KEYCLOAK_ADMIN_URL:?Set KEYCLOAK_ADMIN_URL (e.g. https://klassenzeit-auth.pascalkraus.com)}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:?Set KEYCLOAK_ADMIN_USER}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?Set KEYCLOAK_ADMIN_PASSWORD}"

REALM="klassenzeit"

if [[ "$ENV" == "staging" ]]; then
  CLIENT_ID="klassenzeit-staging"
  REDIRECT_URI="https://klassenzeit-staging.pascalkraus.com/*"
  ROOT_URL="https://klassenzeit-staging.pascalkraus.com"
  WEB_ORIGIN="https://klassenzeit-staging.pascalkraus.com"
elif [[ "$ENV" == "prod" ]]; then
  CLIENT_ID="klassenzeit-prod"
  REDIRECT_URI="https://klassenzeit.pascalkraus.com/*"
  ROOT_URL="https://klassenzeit.pascalkraus.com"
  WEB_ORIGIN="https://klassenzeit.pascalkraus.com"
fi

echo "=== Keycloak Setup: $ENV ==="
echo "URL: $KEYCLOAK_URL"
echo "Realm: $REALM"
echo "Client: $CLIENT_ID"
echo ""

# --- Get admin token ---
echo "Authenticating..."
TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER&password=$ADMIN_PASS&grant_type=password&client_id=admin-cli" \
  | jq -r '.access_token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: Failed to authenticate with Keycloak admin"
  exit 1
fi
echo "Authenticated."

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# --- Create realm (if it doesn't exist) ---
REALM_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/admin/realms/$REALM" "${AUTH[@]}")
if [[ "$REALM_EXISTS" == "404" ]]; then
  echo "Creating realm '$REALM'..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms" "${AUTH[@]}" -d '{
    "realm": "'"$REALM"'",
    "enabled": true,
    "sslRequired": "external",
    "registrationAllowed": false,
    "registrationEmailAsUsername": true,
    "rememberMe": true,
    "verifyEmail": true,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "bruteForceProtected": true,
    "permanentLockout": false,
    "maxFailureWaitSeconds": 900,
    "failureFactor": 30,
    "internationalizationEnabled": true,
    "supportedLocales": ["de", "en"],
    "defaultLocale": "de",
    "accessTokenLifespan": 300,
    "ssoSessionIdleTimeout": 1800
  }'
  echo "Realm created."
else
  echo "Realm '$REALM' already exists, skipping."
fi

# --- Create roles (if they don't exist) ---
for ROLE in admin teacher viewer; do
  ROLE_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE" "${AUTH[@]}")
  if [[ "$ROLE_EXISTS" == "404" ]]; then
    echo "Creating role '$ROLE'..."
    curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" "${AUTH[@]}" -d '{
      "name": "'"$ROLE"'"
    }'
    echo "Role '$ROLE' created."
  else
    echo "Role '$ROLE' already exists, skipping."
  fi
done

# --- Create client (if it doesn't exist) ---
EXISTING_CLIENT=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" "${AUTH[@]}" | jq 'length')
if [[ "$EXISTING_CLIENT" == "0" ]]; then
  echo "Creating client '$CLIENT_ID'..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" "${AUTH[@]}" -d '{
    "clientId": "'"$CLIENT_ID"'",
    "name": "Klassenzeit '"${ENV^}"'",
    "enabled": true,
    "publicClient": true,
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": false,
    "protocol": "openid-connect",
    "rootUrl": "'"$ROOT_URL"'",
    "baseUrl": "/",
    "redirectUris": ["'"$REDIRECT_URI"'"],
    "webOrigins": ["'"$WEB_ORIGIN"'"],
    "attributes": {
      "post.logout.redirect.uris": "'"$REDIRECT_URI"'",
      "pkce.code.challenge.method": "S256"
    },
    "defaultClientScopes": ["openid", "web-origins", "acr", "basic", "profile", "email"],
    "optionalClientScopes": ["address", "phone", "offline_access"]
  }'
  echo "Client '$CLIENT_ID' created."
else
  echo "Client '$CLIENT_ID' already exists, skipping."
fi

# --- Get internal client UUID (needed for mapper API) ---
CLIENT_UUID=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" "${AUTH[@]}" | jq -r '.[0].id')
echo "Client UUID: $CLIENT_UUID"

# --- Create protocol mappers (if they don't exist) ---
EXISTING_MAPPERS=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" "${AUTH[@]}" | jq '[.[] | .name]')

if ! echo "$EXISTING_MAPPERS" | jq -e '. | index("school_id")' > /dev/null 2>&1; then
  echo "Creating 'school_id' mapper..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" "${AUTH[@]}" -d '{
    "name": "school_id",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "consentRequired": false,
    "config": {
      "user.attribute": "school_id",
      "claim.name": "school_id",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "multivalued": "false"
    }
  }'
  echo "Mapper 'school_id' created."
else
  echo "Mapper 'school_id' already exists, skipping."
fi

if ! echo "$EXISTING_MAPPERS" | jq -e '. | index("realm_roles")' > /dev/null 2>&1; then
  echo "Creating 'realm_roles' mapper..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" "${AUTH[@]}" -d '{
    "name": "realm_roles",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-realm-role-mapper",
    "consentRequired": false,
    "config": {
      "claim.name": "role",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "multivalued": "true"
    }
  }'
  echo "Mapper 'realm_roles' created."
else
  echo "Mapper 'realm_roles' already exists, skipping."
fi

echo ""
echo "=== Setup complete for $ENV ==="
echo "Client '$CLIENT_ID' is ready at $KEYCLOAK_URL/realms/$REALM"
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x docker/keycloak/setup-realm.sh
```

- [ ] **Step 3: Commit**

```bash
git add docker/keycloak/setup-realm.sh
git commit -m "Add Keycloak Admin API script for staging/prod realm setup"
```

---

### Task 5: Run setup script for staging and prod

**Files:** None (execution only)

Run the setup script against the shared Keycloak instance to create the realm and both environment clients.

- [ ] **Step 1: Set environment variables**

The admin credentials are in `/home/pascal/Code/server-infra/.env.local`. Load them:

```bash
export KEYCLOAK_ADMIN_URL="https://klassenzeit-auth.pascalkraus.com"
export KEYCLOAK_ADMIN_USER="admin"
export KEYCLOAK_ADMIN_PASSWORD="sDkmfRe2y/Tztus9XTZe1fJyz578kGRm"
```

- [ ] **Step 2: Run for staging**

```bash
./docker/keycloak/setup-realm.sh staging
```

Expected: realm created (or skipped if exists), roles created, client `klassenzeit-staging` created with mappers.

- [ ] **Step 3: Run for prod**

```bash
./docker/keycloak/setup-realm.sh prod
```

Expected: realm already exists (created in staging run), roles already exist, client `klassenzeit-prod` created with mappers.

- [ ] **Step 4: Verify staging client**

```bash
TOKEN=$(curl -s -X POST "https://klassenzeit-auth.pascalkraus.com/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=sDkmfRe2y/Tztus9XTZe1fJyz578kGRm&grant_type=password&client_id=admin-cli" \
  | jq -r '.access_token')

curl -s "https://klassenzeit-auth.pascalkraus.com/admin/realms/klassenzeit/clients?clientId=klassenzeit-staging" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {clientId: .clientId, publicClient: .publicClient}'
```

Expected:
```json
{
  "clientId": "klassenzeit-staging",
  "publicClient": true
}
```

- [ ] **Step 5: Verify prod client**

```bash
curl -s "https://klassenzeit-auth.pascalkraus.com/admin/realms/klassenzeit/clients?clientId=klassenzeit-prod" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {clientId: .clientId, publicClient: .publicClient}'
```

Expected:
```json
{
  "clientId": "klassenzeit-prod",
  "publicClient": true
}
```

---

### Task 6: Update documentation

**Files:**
- Modify: `docs/src/development-setup.md`

- [ ] **Step 1: Add Keycloak section to development setup docs**

Add to `docs/src/development-setup.md` a section explaining:
- Dev Keycloak starts automatically with `docker compose up`
- Realm is auto-imported on first boot
- Seed users and their credentials (admin@test.com / teacher@test.com / viewer@test.com, password: test1234)
- How to access Keycloak admin UI: `http://localhost:8080` (admin/admin)
- For staging/prod: run `./docker/keycloak/setup-realm.sh <env>` (one-time setup)

Read the current content of `docs/src/development-setup.md` first and add the section in the appropriate place.

- [ ] **Step 2: Commit**

```bash
git add docs/src/development-setup.md
git commit -m "Add Keycloak dev setup instructions to docs"
```
