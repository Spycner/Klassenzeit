-- docker/postgres/init-databases.sql
-- Mounted by /home/pascal/Code/server-infra/docker-compose.yml into the
-- postgres service's /docker-entrypoint-initdb.d directory. Runs once when
-- the postgres_data volume is empty. Idempotent so re-execution after a
-- manual volume wipe is safe.
--
-- Uses the \gexec pattern so conditional CREATE DATABASE works under psql
-- despite CREATE DATABASE not supporting IF NOT EXISTS.

-- Keycloak database. Owner stays as the shared superuser so
-- KC_DB_USERNAME/KC_DB_PASSWORD (declared in server-infra/.env.local) keep
-- working without additional role grants.
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

-- Dedicated Klassenzeit staging role. The placeholder password MUST be
-- rotated before the first real deploy: on an already-running Postgres,
-- follow deploy/README.md's bootstrap section instead of relying on this
-- script.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'klassenzeit_staging') THEN
        CREATE ROLE klassenzeit_staging LOGIN PASSWORD 'CHANGE_ME';
    END IF;
END
$$;

SELECT 'CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'klassenzeit_staging')\gexec
