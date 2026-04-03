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

# --- Helper: parse JSON with python3 (jq not available) ---
pyjq() {
  python3 -c "import json,sys; data=json.load(sys.stdin); $1"
}

# --- Get admin token ---
echo "Authenticating..."
TOKEN_RESPONSE=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER&password=$ADMIN_PASS&grant_type=password&client_id=admin-cli")

TOKEN=$(echo "$TOKEN_RESPONSE" | pyjq "print(data['access_token'])")

if [[ -z "$TOKEN" || "$TOKEN" == "None" ]]; then
  echo "ERROR: Failed to authenticate with Keycloak admin"
  exit 1
fi
echo "Authenticated."

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# --- Create realm (if it doesn't exist) ---
REALM_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/admin/realms/$REALM" "${AUTH[@]}")
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
  ROLE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE" "${AUTH[@]}")
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
EXISTING_CLIENT=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" "${AUTH[@]}" \
  | pyjq "print(len(data))")
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
CLIENT_UUID=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" "${AUTH[@]}" \
  | pyjq "print(data[0]['id'])")
echo "Client UUID: $CLIENT_UUID"

# --- Create protocol mappers (if they don't exist) ---
EXISTING_MAPPERS=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" "${AUTH[@]}" \
  | pyjq "print(json.dumps([m['name'] for m in data]))")

if ! echo "$EXISTING_MAPPERS" | python3 -c "import json,sys; names=json.loads(sys.stdin.read()); exit(0 if 'school_id' in names else 1)"; then
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

if ! echo "$EXISTING_MAPPERS" | python3 -c "import json,sys; names=json.loads(sys.stdin.read()); exit(0 if 'realm_roles' in names else 1)"; then
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
