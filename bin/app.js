#!/usr/bin/env node

import {
	FDecimal,
	FLogger,
	FLoggerConsole,
} from "@freemework/common";
import { FDecimalBackendBigNumber } from "@freemework/decimal.bignumberjs";
import { flauncher } from "@freemework/hosting";
import { FSqlConnectionFactoryPostgres } from "@freemework/sql.postgres";

import fs from "fs";
import { createRequire } from "module";

import {
	DatabaseFactory,
	Monitoring, MonitoringImpl,
	LoggerSettings,
	SingletonProviderExecutionContext,
	ApprovementService, ApprovementServiceImpl,
	MessengerService, MessengerServiceImpl,
	Settings,
	WorkflowCache, WorkflowDatabaseFactory, WorkflowRunner,
	WorkflowService, WorkflowServiceImpl,
	bootstrap,
	messengersFactory,
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

	const messengers = messengersFactory(settings);
	const databaseFactory = DatabaseFactory.fromSqlConnectionFactory(sqlConnectionFactory);
	const workflowCache = WorkflowCache.fromConnectivityUrl(settings.cacheConnectivity.url);
	const workflowDatabaseFactory = WorkflowDatabaseFactory.fromSqlConnectionFactory(sqlConnectionFactory);
	const workflowRunner = new WorkflowRunner(
		workflowCache,
		workflowDatabaseFactory,
		// Workflow Runner tags
		process.env['BUILD_CONFIGURATION'] !== 'release' ? ['dev'] : ['production'],
	);

	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, MessengerService, new MessengerServiceImpl(messengers));
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, FSqlConnectionFactoryPostgres, sqlConnectionFactory);
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, DatabaseFactory, databaseFactory);
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, Monitoring, new MonitoringImpl());
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, WorkflowDatabaseFactory, workflowDatabaseFactory);
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, WorkflowCache, workflowCache);
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, ApprovementService, new ApprovementServiceImpl(
		{
			approvements: settings.approvements,
			messengers: settings.messengers,
		},
		messengers,
	));
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, WorkflowService, new WorkflowServiceImpl(
		{
			workflows: settings.workflows.values(),
		},
		{
			messengers,
			databaseFactory,
			workflowCache,
			workflowDatabaseFactory,
			workflowRunner,
			sqlConnectionFactory,
		}
	));
	appExecutionContext = new SingletonProviderExecutionContext(appExecutionContext, WorkflowRunner, workflowRunner);

	const runtime = await bootstrap(
		appExecutionContext,
		{
			settings,
		},
	);

	return runtime;
}

// Launch the app
flauncher(Settings.fromConfiguration, createRuntime);
