#!/bin/bash
#

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )

export ENV="${1}"
if [ -z "${ENV}" ]; then
  export ENV="local"
fi

docker run --interactive --tty --rm \
  --mount type=bind,source="${DIR}",target=/data \
  --env ENV \
  --env SOURCE_PATH=migration \
  --env VERSION_TO=v9999 \
  theanurin/sqlmigrationbuilder:1.2
