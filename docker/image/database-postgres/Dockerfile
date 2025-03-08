ARG BUILD_CONFIGURATION=release
ARG SQL_MIGRATION_BUILDER_IMAGE=theanurin/sqlmigrationbuilder:1.2
ARG SQL_MIGRATION_RUNNER_IMAGE=theanurin/sqlmigrationrunner:1.5
ARG DEVEL_POSTGRES_IMAGE=theanurin/devel.postgres-15:15.7-2
ARG CONFIGURATION_TEMPLATES_IMAGE=theanurin/configuration-templates:20231204

FROM ${CONFIGURATION_TEMPLATES_IMAGE} as vars
ARG BUILD_CONFIGURATION
WORKDIR /build
COPY database/database.config .
COPY database/database-${BUILD_CONFIGURATION}.config .
RUN mkdir --parents .stage/migration.vars
RUN \
    echo -n "{{ database.name }}" \
    | /usr/local/bin/docker-entrypoint.js \
    --engine mustache \
    --config-file=database.config \
    --config-file="database-${BUILD_CONFIGURATION}.config" \
    > .stage/migration.vars/DATABASE_NAME
RUN \
    echo -n "{{ database.user.owner }}" \
    | /usr/local/bin/docker-entrypoint.js \
    --engine mustache \
    --config-file=database.config \
    --config-file="database-${BUILD_CONFIGURATION}.config" \
    > .stage/migration.vars/DATABASE_OWNER

FROM ${SQL_MIGRATION_RUNNER_IMAGE} AS sql_runner

FROM ${SQL_MIGRATION_BUILDER_IMAGE} AS sql_builder
ARG BUILD_CONFIGURATION
ARG BUILD_VERSION_FROM
ARG BUILD_VERSION_TO
# Set work directory
WORKDIR /build
# Install necessary tools
RUN apk add --no-cache tree
COPY database/migration ./migration
COPY database/database.config .
COPY database/database-${BUILD_CONFIGURATION}.config .
RUN ENV="${BUILD_CONFIGURATION}" VERSION_FROM="${BUILD_VERSION_FROM}" VERSION_TO="${BUILD_VERSION_TO}" /usr/local/bin/docker-entrypoint.js
RUN mkdir --parents .stage/usr/local/bin .stage/usr/local/sqlmigration
RUN mv .dist .stage/migration.dist
COPY --from=sql_runner /usr/local/sqlmigration .stage/usr/local/sqlmigration
COPY --from=sql_runner /usr/local/bin/docker-entrypoint.sh .stage/usr/local/bin/docker-entrypoint-sql-migration-runner.sh

FROM ${DEVEL_POSTGRES_IMAGE} AS build_stage
RUN apk add --no-cache nodejs
COPY --from=sql_builder /build/.stage /
COPY --from=vars        /build/.stage /
COPY ./docker/image/database-postgres/generate-data.sh /.builder-postgres.sh
RUN /usr/local/bin/docker-builder-postgres-15.sh --listen-localhost

FROM ${DEVEL_POSTGRES_IMAGE}
COPY --from=build_stage /build/ /
