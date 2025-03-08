ARG BUILD_CONFIGURATION=release
ARG SQL_MIGRATION_BUILDER_IMAGE=theanurin/sqlmigrationbuilder:1.2
ARG SQL_MIGRATION_RUNNER_IMAGE=theanurin/sqlmigrationrunner:1.7

FROM ${SQL_MIGRATION_RUNNER_IMAGE} AS sql_runner

FROM ${SQL_MIGRATION_BUILDER_IMAGE} AS sql_builder
ARG BUILD_CONFIGURATION
ARG BUILD_VERSION_FROM
ARG BUILD_VERSION_TO
# Set work directory
WORKDIR /build
# Install necessary tools
RUN apk add --no-cache tree
# Add migration scripts
COPY database/migration ./migration
# Add default configuration
COPY database/database.config .
# Add build specific configuration
COPY database/database-${BUILD_CONFIGURATION}.config .
# Build SQL scripts
RUN ENV="${BUILD_CONFIGURATION}" VERSION_FROM="${BUILD_VERSION_FROM}" VERSION_TO="${BUILD_VERSION_TO}" /usr/local/bin/docker-entrypoint.js
RUN mkdir --parents .stage/usr/local/bin .stage/usr/local/sqlmigration
RUN mv .dist .stage/data
RUN (cd .stage/data/ && tree) | sed 's/[[:blank:]]/·/g' > .stage/usr/local/sqlmigration/README.md
COPY database/RELEASE_NOTES.md ./.stage/data/
COPY --from=sql_runner /usr/local/bin/docker-entrypoint.sh .stage/usr/local/bin/docker-entrypoint-sql-migration-runner.sh
COPY docker/image/database-migration/docker-entrypoint.sh .stage/usr/local/bin/docker-entrypoint.sh

FROM ${SQL_MIGRATION_RUNNER_IMAGE}
COPY --from=sql_builder /build/.stage /
ENTRYPOINT [ "/usr/local/bin/docker-entrypoint.sh" ]
