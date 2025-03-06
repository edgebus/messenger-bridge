export { createLoggerFactory } from "./utils/logger_factory.js";
export { type LoggerSettings, createLoggerSettings } from "./utils/logger_settings.js";
// export { FactoryProviderExecutionContext, FactoryProviderExecutionElement } from "./utils/factory_provider_execution_context.js";
export { SingletonProviderExecutionContext, SingletonProviderExecutionElement } from "./utils/singleton_provider_execution_context.js";
export { appInfo } from "./app-info.js";
export { Monitoring, MonitoringImpl } from "./service/monitoring.service.js";
export { Service, ServiceImpl } from "./service/approvement.service.js";
export { Settings } from "./settings.js";
// export { MaskService } from "./utils/mask_service.js"

import {
	FDisposable,
	FException,
	FExecutionContext,
	FInitable,
	FLogger,
	FLoggerLabelsExecutionContext,
	makeDisposable
} from "@freemework/common";
import { createWebServers, FWebServer } from "@freemework/hosting";

import { EventEmitter } from 'events'
import express from "express";
import path from "path";

import { Settings } from "./settings.js";

import { MisconfigurationException } from "./exception/misconfiguration.exception.js";

// import "./utils/abort_controller.js";
import { createExecutionContextMiddleware } from "./utils/express/execution_context.middleware.js";
import { createRequestLoggerMiddleware } from "./utils/express/request_logger.middleware.js";
// import { createCorsMiddleware } from "./utils/express/cors.middleware.js";

// import { FactoryProviderExecutionContext } from "./utils/factory_provider_execution_context.js";
import { SingletonProviderExecutionContext } from "./utils/singleton_provider_execution_context.js";

import { appInfo } from "./app-info.js";
import {
	InfoEndpoint,
	LivenessEndpoint,
	MonitoringEndpoint,
	ReadinessEndpoint,
	RestEndpoint,
	StaticContentEndpoint,
} from "./endpoint/index.js";
import { Monitoring } from "./service/monitoring.service.js";
import { Service } from "./service/approvement.service.js";

const __dirname: string = import.meta.dirname;

export async function bootstrap(
	executionContext: FExecutionContext,
	opts: {
		readonly settings: Settings,
		readonly hooks?: {
			hookBeforeEndpointRegistration?(serversMap: Map<FWebServer["name"], FWebServer>): void;
			hookAfterEndpointRegistration?(serversMap: Map<FWebServer["name"], FWebServer>): void;
		}
	},
): Promise<FDisposable> {
	const { settings, hooks } = opts;

	executionContext = new FLoggerLabelsExecutionContext(executionContext, {
		appVersion: appInfo.version
	});

	FExecutionContext.Default = executionContext;

	const bootstrapLogger: FLogger = FLogger.create("Bootstrap");

	// MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 close listeners added to [Socket].
	EventEmitter.defaultMaxListeners = 25;
	bootstrapLogger.trace(executionContext, () => `Set EventEmitter.defaultMaxListeners to ${EventEmitter.defaultMaxListeners}`);

	const { instance: monitoring } = SingletonProviderExecutionContext.of(executionContext, Monitoring);
	const { instance: service } = SingletonProviderExecutionContext.of(executionContext, Service);

	let isConfigured = false;

	const servers = createWebServers(settings.servers);

	for (const server of servers) {
		bootstrapLogger.trace(executionContext, () => `Configuring server '${server.name}' ...`);

		server.rootExpressApplication.enable("case sensitive routing"); // "/Foo" and "/foo" should be different routes
		server.rootExpressApplication.enable("strict routing"); // the router should treat "/foo" and "/foo/" as different.

		if (!("NODE_ENV" in process.env) || process.env["NODE_ENV"] === "production") {
			server.rootExpressApplication.set("env", "production"); // by default use production mode
			server.rootExpressApplication.disable("x-powered-by"); // Hide real www server (security reason)
		} else {
			server.rootExpressApplication.set("json spaces", 4);
		}

		server.rootExpressApplication.use(createExecutionContextMiddleware());
		server.rootExpressApplication.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
			if (isConfigured !== true) {
				res.writeHead(503, "Service temporary unavailable. Please wait. Launching...").end();
				return;
			} else {
				next();
				return;
			}
		});
		server.rootExpressApplication.use(monitoring.collectMiddleware); // collect metrics on each server
	}

	bootstrapLogger.trace(executionContext, "Initializing all parts of the service ...");
	await FInitable.initAll(executionContext,
		...servers,
	);

	const disposableItems: Array<FDisposable> = [
		...servers.map(server =>
			makeDisposable(() => {
				server.underlyingServer.closeAllConnections();
				return server.dispose();
			})
		),
	].reverse();
	try {
		const serversMap: Map<FWebServer["name"], FWebServer> = new Map(servers.map(s => [s.name, s]));

		if (hooks !== undefined && hooks.hookBeforeEndpointRegistration !== undefined) {
			hooks.hookBeforeEndpointRegistration(serversMap);
		}

		const resources: Array<FInitable> = [];

		if(service instanceof FInitable) {
			resources.push(service);
		}
		if(monitoring instanceof FInitable) {
			resources.push(monitoring);
		}

		for (const endpointSettings of settings.endpoints) {

			const endpointServers: ReadonlyArray<FWebServer> = endpointSettings.servers.map(function (bindServerName) {
				const bindServer: FWebServer | undefined = serversMap.get(bindServerName);
				if (bindServer === undefined) {
					throw new MisconfigurationException(`Trying to bind endpoint '${endpointSettings.name}' to non-existing server: '${bindServerName}'`);
				}
				return bindServer;
			});

			switch (endpointSettings.type) {
				case "info":
					resources.push(new InfoEndpoint(endpointServers, endpointSettings));
					break;
				case "liveness":
					resources.push(new LivenessEndpoint(endpointServers, endpointSettings));
					break;
				case "monitoring":
					resources.push(new MonitoringEndpoint(endpointServers, endpointSettings, monitoring));
					break;
				case "readiness":
					resources.push(new ReadinessEndpoint(endpointServers, endpointSettings));
					break;
				case "rest":
					resources.push(new RestEndpoint(endpointServers, endpointSettings, service));
					break;
				case "websocket":
					resources.push(new LivenessEndpoint(endpointServers, endpointSettings));
					// endpoints.push(new WebSocketEndpoint(endpointServers, endpointSettings, service));
					break;
				case "welcome-page":
					resources.push(new StaticContentEndpoint(endpointServers, {
						...endpointSettings,
						staticFilesDir: path.join(__dirname, "..", "res", "welcome_page_content"),
					}));
					break;
				default:
					class UnsupportedEndpointException extends MisconfigurationException {
						public constructor(endpointType: never) {
							super(`Unsupported endpoint: '${endpointType}'`);
						}
					}
					throw new UnsupportedEndpointException(endpointSettings);
			}

			// if (endpoint.useLogger) { // Setup request logger middleware
			// 	const router: Router = Router();
			// 	router.use(createRequestLoggerMiddleware(`${bindServerName}:${endpoint.name}`)); // Log success such 2xx
			// 	router.use(endpointRequestHandler);
			// 	endpointRequestHandler = router;
			// }

			// if ("cors" in endpoint && endpoint.cors !== null) {
			// 	bindServer.rootExpressApplication.use(endpointBindPath, createCorsMiddleware(endpoint.cors), endpointRequestHandler);
			// 	bootstrapLogger.info(executionContext, () => `Endpoint '${endpointType}' was assigned to server the '${bindServerName}' as path '${endpointBindPath}'.`);
			// }
			// else {
			// 	bindServer.rootExpressApplication.use(endpointBindPath, endpointRequestHandler);
			// 	bootstrapLogger.warn(executionContext, () => `Endpoint '${endpointType}' was assigned to server the '${bindServerName}' as path '${endpointBindPath}' without CORS configuration.`);
			// }
			// }
		}
		if (hooks !== undefined && hooks.hookAfterEndpointRegistration !== undefined) {
			hooks.hookAfterEndpointRegistration(serversMap);
		}

		await FInitable.initAll(executionContext, ...resources);
		{
			const disposableResources: ReadonlyArray<FInitable> = [...resources].reverse();
			disposableItems.unshift(...disposableResources);
		}

		for (const server of servers) {
			server.rootExpressApplication.use(createRequestLoggerMiddleware(server.name));

			// 404 Not found (bad URL)
			server.rootExpressApplication.use(function (_req: express.Request, res: express.Response) {
				res.status(404).end("404 Not Found");
			});

			// 5xx Fatal error
			server.rootExpressApplication.use(function (err: any, req: express.Request, _res: express.Response, next: express.NextFunction): any {
				if (err) {
					//TODO: send email, log err, etc...
					const ex: FException = FException.wrapIfNeeded(err);
					const msg = "Unhandled exception";
					bootstrapLogger.error(executionContext, () => `500 ${req.method} ${req.originalUrl} HTTP/${req.httpVersion}. ${msg}. ${ex.message}.`);
					bootstrapLogger.debug(executionContext, () => `500 ${req.method} ${req.originalUrl} HTTP/${req.httpVersion}. ${msg}`, ex);
				}
				//return res.status(500).end("500 Internal Error");
				return next(err); // use express exception render
			});
		}
	} catch (e) {
		await FDisposable.disposeAll(...disposableItems);
		throw e;
	}

	isConfigured = true;
	return makeDisposable(async function () {
		bootstrapLogger.debug(executionContext, "Disposing all parts of the service ...");
		await FDisposable.disposeAll(...disposableItems);
		bootstrapLogger.info(executionContext, "All runtime objects were closed.");
	});
}
