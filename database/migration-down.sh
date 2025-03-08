#!/bin/bash
#

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )


DO_IGNORE_ERROR=no
# parse args
while [ "$1" != "" ]; do
	case "$1" in
		--ignore-errors)
			DO_IGNORE_ERROR=yes
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

if [ "${DO_IGNORE_ERROR}" != "yes" ]; then
	set -e
fi

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

echo "Rollback migrations..."
docker run --network=edgebus-local-tier \
  --rm --interactive --tty \
  --env DB_URL \
  --env LOG_LEVEL=info \
  theanurin/sqlmigrationrunner:1.7 \
    rollback --no-sleep
