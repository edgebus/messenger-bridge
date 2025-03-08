#!/bin/sh
#

set -e

DB_NAME=$(cat /migration.vars/DATABASE_NAME)
DB_OWNER=$(cat /migration.vars/DATABASE_OWNER)

# Execute command via file using Redirecting Input redirections
psql --dbname=postgres --username=postgres --set user="${DB_OWNER}" --file=<(echo 'CREATE USER :"user" WITH LOGIN;')

# Execute command via Here Documents redirections
psql --dbname=postgres --username=postgres --set db="${DB_NAME}" --set db_owner="${DB_OWNER}" <<-'EOSQL'
    CREATE DATABASE :"db" WITH
    OWNER = :"db_owner" ENCODING = 'UTF8'
    CONNECTION LIMIT = -1;
EOSQL

echo "Wow, ${DB_NAME} was created successfully!"

export MIGRATION_DIR="/migration.dist"
export DB_URL="postgres://${DB_OWNER}@127.0.0.1:5432/${DB_NAME}"

exec /usr/local/bin/docker-entrypoint-sql-migration-runner.sh migration-up --no-sleep
