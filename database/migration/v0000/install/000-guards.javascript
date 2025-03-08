async function migration(executionContext, sqlConnection, logger) {
	{ // Database name guard
		const dbName = (await sqlConnection.statement("SELECT current_database()").executeScalar(executionContext)).asString;
		if (dbName !== "{{database.name}}") {
			throw new Error(`Wrong database! Current database '${dbName}' is not equals to expected database '{{database.name}}'`);
		}
	}

	{ // Migration user guard
		const dbUser = (await sqlConnection.statement("SELECT current_user").executeScalar(executionContext)).asString;
		if (dbUser !== "{{database.user.owner}}") {
			throw new Error(`Wrong database user! Current database user '${dbUser}' is not equals to expected user '{{database.user.owner}}'`);
		}
	}

	{ // Version guard
		const versionRow = await sqlConnection
			.statement('SELECT "version", "utc_deployed_at" FROM "public"."__migration" ORDER BY "version" DESC LIMIT 1')
			.executeSingleOrNull(executionContext);

		if (versionRow !== null) {
			const version = versionRow.get("version").asString;
			throw new Error(`Wrong database! Some migrations found. Expected no migrations (latest version: ${version}). Cannot continue.`);
		}
	}
}
