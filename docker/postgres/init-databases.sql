-- Create databases for Keycloak and Klassenzeit staging/prod
-- Dev uses its own PostgreSQL container (see docker-compose.yml)
CREATE DATABASE keycloak;
CREATE DATABASE klassenzeit_staging;
CREATE DATABASE klassenzeit_prod;
