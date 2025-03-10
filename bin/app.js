#!/usr/bin/env node

import {
	FDecimal,
	FLogger,
	FLoggerConsole,
} from "@freemework/common";
import { FDecimalBackendBigNumber } from "@freemework/decimal.bignumberjs";
import { FLauncher } from "@freemework/hosting";
import { FSqlConnectionFactoryPostgres } from '@freemework/sql.postgres';

import fs from "fs";
import { createRequire } from "module";

import {
	DatabaseFactory,
	Monitoring, MonitoringImpl,
	LoggerSettings,
	SingletonProviderExecutionContext,
	Service, ServiceImpl,
	Settings,
	bootstrap,
} from "../lib/index.js";

import { Activity } from "../lib/2nd/workflow/activities/Activity.js";

const require = createRequire(import.meta.url);

// const __dirname = import.meta.dirname;
const __filename = import.meta.filename;

console.log(fs.readFileSync(__filename.replace(/.js$/, ".logo")).toString());
const { name: serviceName, version: serviceVersion } = require("../package.json");
console.log(`Package: ${serviceName}@${serviceVersion}\n`);

{
	// Configure logger
	const loggerSettings = LoggerSettings.fromEnvironmentVariables();
	FLogger.setLoggerFactory(function (loggerName) {
		return FLoggerConsole.create(loggerName, loggerSettings);
	});
}

// Configure decimal limit and default rounding behavior
FDecimal.configure(new FDecimalBackendBigNumber(24, 'Trunc'));

// Configure workflow versioning
Activity.appVersion = serviceVersion;

async function createRuntime(bootstrapExecutionContext, settings) {
	let appExecutionContext = bootstrapExecutionContext;

	const sqlConnectionFactory = new FSqlConnectionFactoryPostgres({
		url: settings.databaseConnectivity.url,
		log: FLogger.create("PostgresDB"),
		applicationName: `${serviceName} v${serviceVersion}`,
	});

	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, FSqlConnectionFactoryPostgres, sqlConnectionFactory);
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, DatabaseFactory, DatabaseFactory.fromSqlConnectionFactory(sqlConnectionFactory));
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, Monitoring, new MonitoringImpl());
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, Service, new ServiceImpl({
		approvementTopics: settings.approvementTopics,
		messengers: settings.messengers,
	}));

	const runtime = await bootstrap(
		appExecutionContext,
		{
			settings,
		},
	);

	return runtime;
}

// Launch the app
FLauncher(Settings.fromConfiguration, createRuntime);
