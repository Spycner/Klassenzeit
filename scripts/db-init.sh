#!/bin/bash
# Runs on first Postgres container boot, via Postgres' docker-entrypoint-initdb.d
# convention. Creates the test database alongside the dev one.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE klassenzeit_test OWNER klassenzeit;
EOSQL
