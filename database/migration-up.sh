#!/bin/bash
#

set -e

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )


DO_BUILD=yes
DO_DIAGRAM=no
# parse args
while [ "$1" != "" ]; do
  case "$1" in
    --no-build)
      DO_BUILD=no
      ;;
    --no-diagram)
      DO_DIAGRAM=no
      ;;
    --diagram)
      DO_DIAGRAM=yes
      ;;
    --target-version=*)
      DO_TARGET_VERSION=$(echo -n "$1" | sed 's/--target-version=//g')
      ;;
    *)
      echo "Unexpected parameter $1" >&2
      exit 1
      ;;
  esac
  shift
done

export ENV="${1}"

if [ -z "${ENV}" ]; then
  export ENV="local"
fi

if [ "${DO_BUILD}" == "yes" ]; then
  echo "Building migration sources..."
  ${DIR}/migration-build.sh
else
  echo "Skip building migration sources due to --no-build"
fi
echo

SCHEMA_NAMES=$(echo "{{#database.schemas}}|{{name}}{{/database.schemas}}" | \
  docker run \
    --interactive --rm \
    --mount type=bind,source="${PWD}",target=/tmp \
    theanurin/configuration-templates:20231204 \
      --engine mustache \
      --config-file=/tmp/database.config \
      --config-file="/tmp/database-${ENV}.config"
)

USER_NAMES=$(echo "{{#database.users}}{{.}} {{/database.users}}" | \
  docker run \
    --interactive --rm \
    --mount type=bind,source="${PWD}",target=/tmp \
    theanurin/configuration-templates:20231204 \
      --engine mustache \
      --config-file=/tmp/database.config \
      --config-file="/tmp/database-${ENV}.config"
)

DATABASE_NAME=$(echo -n "{{ database.name }}" | \
  docker run \
    --interactive --rm \
    --mount type=bind,source="${DIR}",target=/tmp \
    theanurin/configuration-templates:20231204 \
      --engine mustache \
      --config-file=/tmp/database.config \
      --config-file="/tmp/database-${ENV}.config"
)

DATABASE_OWNER=$(echo -n "{{ database.user.owner }}" | \
  docker run \
    --interactive --rm \
    --mount type=bind,source="${DIR}",target=/tmp \
    theanurin/configuration-templates:20231204 \
      --engine mustache \
      --config-file=/tmp/database.config \
      --config-file="/tmp/database-${ENV}.config"
)

export DB_URL="postgres://${DATABASE_OWNER}@postgres:5432/${DATABASE_NAME}"

echo "Apply migrations into ${DB_URL} ..."
docker run --network=edgebus-local-tier \
  --rm --interactive --tty \
  --env DB_URL \
  --env DB_TARGET_VERSION=v9999 \
  --env LOG_LEVEL=fatal \
  --env MODE=lax \
  --volume "${DIR}/.dist:/data" \
  theanurin/sqlmigrationrunner:1.7 \
    install --no-sleep --mode=lax

if [ "${DO_DIAGRAM}" == "yes" ]; then
  echo "Generate diagram.png ..."
  docker run --network=edgebus-local-tier \
    --rm --interactive --tty \
    --mount type=bind,source="${DIR}",target=/home/schcrwlr/share \
    --mount type=bind,source="${DIR}/misc/schemacrawler.properties",target=/etc/schemacrawler.properties \
    --user "$(id -u)":"$(id -g)" \
    schemacrawler/schemacrawler \
      /opt/schemacrawler/bin/schemacrawler.sh \
      --config-file=/etc/schemacrawler.properties \
      --server=postgresql \
      --host=postgres \
      --port=5432 \
      --database="${DATABASE_NAME}" \
      --schemas="public${SCHEMA_NAMES}" \
      --user="${DATABASE_OWNER}" \
      --password="" \
      --info-level standard \
      --command=schema \
      --output-format=png \
      --output-file=share/diagram.png
      # --command script \
      # --parents 1 \
      # --script-language python \
      # --script mermaid.py \
      # --output-file share/sc.mmd
else
  echo "Skip generate diagram.png. Use --diagram/--no-diagram to control this behavor."
fi
echo
