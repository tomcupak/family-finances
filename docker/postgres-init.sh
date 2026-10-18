#!/bin/sh
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE "family_finances";
    ALTER DATABASE "family_finances" OWNER TO postgres;
    GRANT ALL PRIVILEGES ON DATABASE "family_finances" TO postgres;
EOSQL
