#!/bin/sh

sleep 5

export DB_URL="${MIGRATION__POSTGRES__URL}"
export DB_USER="${MIGRATION__POSTGRES__USER}"
export DB_PASSWORD="${MIGRATION__POSTGRES__PASSWORD}"

exec /usr/local/bin/docker-entrypoint-sql-migration-runner.sh "$@" --mode=lax
