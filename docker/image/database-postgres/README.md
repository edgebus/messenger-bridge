# Postgres Server Docker Image

## Pull

```shell
docker login ghcr.io
docker pull ghcr.io/edgebus/messenger-bridge/database/postgres/snapshot
```

## Run manually

```shell
docker run \
  --rm \
  --interactive \
  --tty \
  --network edgebus-local-tier \
  --hostname postgres-snapshot \
  ghcr.io/edgebus/messenger-bridge/database/postgres/snapshot
```

## Build

Before build you have to export some variables

```shell
export BUILD_CONFIGURATION=snapshot  # snapshot or release
export BUILD_COMMIT_REF=$(git rev-parse HEAD)
export BUILD_COMMIT_TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%z")
export BUILD_PIPELINE_URL=http://pipeline.local
export BUILD_PROJECT_URL=http://project.local
export BUILD_VERSION_APPENDER=-local
export BUILD_RC_VERSION=
export BUILD_TAG_VERSION=
```

NOTE: You may pass `--platform=linux/arm64/v8`, `--platform=linux/amd64` etc.

```shell
docker build \
  --no-cache \
  --progress=plain \
  --tag edgebus.example.org/messenger-bridge/database/postgres/snapshot \
  --build-arg BUILD_CONFIGURATION \
  --build-arg BUILD_COMMIT_REF \
  --build-arg BUILD_COMMIT_TIMESTAMP \
  --build-arg BUILD_PIPELINE_URL \
  --build-arg BUILD_PROJECT_URL \
  --build-arg BUILD_VERSION_APPENDER \
  --build-arg BUILD_VERSION_TO="v9999" \
  --build-arg BUILD_RC_VERSION \
  --build-arg BUILD_TAG_VERSION \
  --file docker/image/database-postgres/Dockerfile \
  .
```
