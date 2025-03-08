export { DatabaseFactory } from './database_factory.js';
export { DatabaseSql } from './database_sql.js';
export { Database } from './database.js';

import { FExceptionInvalidOperation, FSqlConnectionFactory } from '@freemework/common';

import { DatabaseFactory } from './database_factory.js';
import { PostgresDatabaseFactory } from './postgres/index.js';
import { FSqlConnectionFactoryPostgres } from '@freemework/sql.postgres';

function createDatabaseFactoryFromSqlConnectionFactory(sqlConnectionFactory: FSqlConnectionFactory): DatabaseFactory {
	if (!(sqlConnectionFactory instanceof FSqlConnectionFactoryPostgres)) {
		throw new FExceptionInvalidOperation("Database supports PostgreSQL only (yet). We are sorry...");
	}
	return new PostgresDatabaseFactory(sqlConnectionFactory);
}

function createDatabaseFactoryFromConnectivityUrl(connectivityUrl: URL): DatabaseFactory {
	switch (connectivityUrl.protocol) {
		case "postgres:":
		case "postgres+ssl:":
			return new PostgresDatabaseFactory(connectivityUrl);
		default:
			throw new FExceptionInvalidOperation(`Unsupported database connectivity protocol '${connectivityUrl.protocol}'`);
	}
}

declare module "./database_factory.js" {
	namespace DatabaseFactory {
		function fromConnectivityUrl(connectivityUrl: URL): DatabaseFactory;
		function fromSqlConnectionFactory(sqlConnectionFactory: FSqlConnectionFactory): DatabaseFactory;
	}
}
DatabaseFactory.fromConnectivityUrl = createDatabaseFactoryFromConnectivityUrl;
DatabaseFactory.fromSqlConnectionFactory = createDatabaseFactoryFromSqlConnectionFactory;
