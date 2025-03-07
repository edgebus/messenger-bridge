#!/usr/bin/env node

import { FLogger, FLoggerLevel } from "@freemework/common";
import { FLauncher } from "@freemework/hosting";

import fs from "fs";
import { createRequire } from "module";

import {
	Monitoring, MonitoringImpl,
	SingletonProviderExecutionContext,
	Service, ServiceImpl,
	Settings,
	bootstrap,
	createLoggerFactory,
	createLoggerSettings,
} from "../lib/index.js";

const require = createRequire(import.meta.url);

// const __dirname = import.meta.dirname;
const __filename = import.meta.filename;

console.log(fs.readFileSync(__filename.replace(/.js$/, ".logo")).toString());
const { name: serviceName, version: serviceVersion } = require("../package.json");
console.log(`Package: ${serviceName}@${serviceVersion}\n`);

{
	// Configure logger
	const loggerSettings = createLoggerSettings();
	const loggerFactory = createLoggerFactory(
		FLoggerLevel.parse(loggerSettings.logLevel.toUpperCase()),
		loggerSettings.logFormat,
	);
	FLogger.setLoggerFactory(loggerFactory);
}

async function createRuntime(bootstrapExecutionContext, settings) {
	let appExecutionContext = bootstrapExecutionContext;

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
