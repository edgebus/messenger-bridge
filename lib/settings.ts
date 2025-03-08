import { FExceptionInvalidOperation, FException, FConfiguration, FConfigurationValue, FConfigurationException } from "@freemework/common";
import { FHostingSettings } from "@freemework/hosting";

import * as _ from "lodash";

import { ApprovementTopicName } from "./model/primitives.js";
import { ApprovementTopic, ApprovementTopicMap } from "./model/approvement_topic.js";

export class Settings {
	protected constructor(
		/**
		 * Servers
		 */
		public readonly servers: ReadonlyArray<FHostingSettings.WebServer>,

		/**
		 * Endpoints configuration
		 */
		public readonly endpoints: ReadonlyArray<Settings.Endpoint>,

		/**
		 * ???
		 */
		public readonly messengers: Settings.MessengerMap,

		/**
		 * ???
		 */
		public readonly approvementTopics: ApprovementTopicMap,

		/**
		 * URL Connectivity to your Database instance
		 */
		public readonly databaseConnectivity: Settings.URLConnectivity,

		/**
		 * URL Connectivity to your Cache instance
		 */
		public readonly cacheConnectivity: Settings.URLConnectivity,
	) { }

	public static fromConfiguration(configuration: FConfiguration): Settings {
		const runtimeConfiguration: FConfiguration = configuration.getNamespace("io.edgebus.messenger-bridge.runtime");

		const servers: Array<FHostingSettings.WebServer> = FHostingSettings.fromConfigurationWebServers(runtimeConfiguration);
		const endpoints: Array<Settings.Endpoint> = runtimeConfiguration.getArray("endpoint").map(Settings.readEndpoint);


		const messengers: ReadonlyMap<Settings.Messenger["name"], Settings.Messenger> = new Map(
			runtimeConfiguration
				.getArray("messenger")
				.map(function (messengerConfiguration: FConfiguration) {
					const messenger = Settings.readMessenger(messengerConfiguration);
					return [messenger.name, messenger];
				})
		);

		const approvementTopics: ReadonlyMap<ApprovementTopicName, ApprovementTopic> = new Map(
			runtimeConfiguration
				.getArray("approvement.topic")
				.map(function (approvementConfiguration: FConfiguration) {
					const approvement = Settings.readApprovementTopic(approvementConfiguration);
					return [approvement.name, approvement];
				})
		);

		const databaseConnectivity: Settings.URLConnectivity = runtimeConfiguration.hasNamespace("database")
			? Settings.readUrlConnectivity(runtimeConfiguration.getNamespace("database"))
			: IN_MEMORY_DATABASE_URL_CONNECTIVITY;

		const cacheConnectivity: Settings.URLConnectivity = runtimeConfiguration.hasNamespace("cache")
			? Settings.readUrlConnectivity(runtimeConfiguration.getNamespace("cache"))
			: IN_MEMORY_DATABASE_URL_CONNECTIVITY;

		return new Settings(
			Object.freeze(servers),
			Object.freeze(endpoints),
			Object.freeze(messengers),
			Object.freeze(approvementTopics),
			databaseConnectivity,
			cacheConnectivity,
		);
	}

	protected static readCors(configuration: FConfiguration): Settings.Cors {
		const methods: ReadonlyArray<string> = Object.freeze(configuration.get("methods").asString.split(" "));
		const whiteList: ReadonlyArray<string> = Object.freeze(configuration.get("whiteList").asString.split(" "));
		const allowedHeaders: ReadonlyArray<string> = Object.freeze(configuration.get("allowedHeaders").asString.split(" "));
		return Object.freeze({ methods, whiteList, allowedHeaders });
	}

	protected static readEndpoint(endpointConfiguration: FConfiguration): Settings.Endpoint {
		const endpointType: Settings.Endpoint["type"] = endpointConfiguration.get("type").asString as Settings.Endpoint["type"];

		function extractServerEndpointInfo<T extends Settings.Endpoint["type"]>(type: T) {
			const endpoint = Object.freeze({
				type,
				servers: endpointConfiguration.get("servers").asString.split(" "),
			});
			return endpoint;
		}

		function extractBaseEndpointInfo<T extends Settings.Endpoint["type"]>(type: T): Settings.Endpoint.Base & { readonly type: T; } {
			const endpoint: Settings.Endpoint.Base & { readonly type: T; } = Object.freeze({
				...extractServerEndpointInfo(type),
				name: endpointConfiguration.namespaceParent!,
				useLogger: endpointConfiguration.get("useLogger", "true").asBoolean,
				bindPath: endpointConfiguration.get("bindPath").asString,
			});
			return endpoint;
		}

		function enrichEndpointApi<T extends Settings.Endpoint.Base>(endpoint: T): T & Settings.Endpoint.Api {
			const cors = endpointConfiguration.hasNamespace("cors")
				? Settings.readCors(endpointConfiguration.getNamespace("cors")) : null;

			return Object.freeze({
				...endpoint,
				cors,
			});
		}

		function enrichEndpointAudit<T extends Settings.Endpoint.Base>(endpoint: T): T & Settings.Endpoint.Auditable {
			const audit = endpointConfiguration.hasNamespace("audit")
				? Object.freeze({
					maxCacheSize: Object.freeze(endpointConfiguration.getNamespace("audit").get("maxCacheSize").asInteger),
				})
				: null;

			return Object.freeze({
				...endpoint,
				audit,
			});
		}

		switch (endpointType) {
			case "info":
				const infoEndpoint: Settings.Endpoint.Info = Object.freeze<Settings.Endpoint.Info>({
					...enrichEndpointAudit(enrichEndpointApi(extractBaseEndpointInfo(endpointType))),
				});

				return infoEndpoint;
			case "rest":
				const restEndpoint: Settings.Endpoint.Rest = Object.freeze<Settings.Endpoint.Rest>({
					...enrichEndpointAudit(enrichEndpointApi(extractBaseEndpointInfo(endpointType))),
				});

				return restEndpoint;
			case "websocket": {
				const webSocketEndpoint: Settings.Endpoint.WebSocket = Object.freeze<Settings.Endpoint.WebSocket>({
					...extractBaseEndpointInfo(endpointType),
					servers: endpointConfiguration.get("servers").asString.split(" "),
					bindPath: endpointConfiguration.get("bindPath", "/").asString,
					defaultProtocol: "json-rpc"
				});

				return webSocketEndpoint;
			}
			case "monitoring":
				{
					const monitoringEndpoint: Settings.Endpoint.Monitoring = Object.freeze<Settings.Endpoint.Monitoring>({
						...extractBaseEndpointInfo(endpointType),
					});

					return monitoringEndpoint;
				}
			case "liveness":
			case "readiness":
				{
					const probeEndpoint: Settings.Endpoint.Probe = Object.freeze<Settings.Endpoint.Probe>({
						...extractBaseEndpointInfo(endpointType),
					});

					return probeEndpoint;
				}
			case "welcome-page":
				{
					const staticEndpoint: Settings.Endpoint.Static = Object.freeze<Settings.Endpoint.Static>({
						...extractBaseEndpointInfo(endpointType),
					});

					return staticEndpoint;
				}
			default:
				throw new UnreachableNotSupportedEndpointException(endpointType);
		}
	}

	protected static readMessenger(messengerConfiguration: FConfiguration): Settings.Messenger {
		const messengerName: string | null = messengerConfiguration.namespaceParent;
		if (messengerName == null) { throw new FExceptionInvalidOperation("Messenger configuration must be an array item (contains namespaceParent). BUG?!"); }
		const messengerType: Settings.Messenger["type"] = messengerConfiguration.get("type").asString as Settings.Messenger["type"];
		switch (messengerType) {
			case "slack":
				throw new FExceptionInvalidOperation("Not implemented yet.");
			case "telegram": {
				const approvementTopicIndexers: ReadonlyArray<string> = messengerConfiguration.get("approvementTopicBinding_indexer").asString.split(" ");
				const approvementTopicBindings: Map<
					Settings.Messenger.Telegram.ApprovementTopicBinding["bindTopic"],
					Settings.Messenger.Telegram.ApprovementTopicBinding
				> = new Map();
				for (const approvementTopicIndexer of approvementTopicIndexers) {
					const approvementTopicBindingKey: string = `approvementTopicBinding.${approvementTopicIndexer}`;
					const bindingConfiguration: FConfiguration = messengerConfiguration.getNamespace(approvementTopicBindingKey);
					const approvementTopicBinding: Settings.Messenger.Telegram.ApprovementTopicBinding = {
						bindTopic: bindingConfiguration.get("bindTopic").asString,
						chatId: bindingConfiguration.get("chatId").asString,
						approvers: bindingConfiguration.has("approvers")
							? new Set(bindingConfiguration.get("approvers").asString.split(" "))
							: null,
						renderTemplate: bindingConfiguration.get("renderTemplate").asString
					};
					if (approvementTopicBindings.has(approvementTopicBinding.bindTopic)) {
						throw new FException(
							`Approvement Topic Binding name '${approvementTopicBinding.bindTopic}' duplication detected.`,
						);
					}
					approvementTopicBindings.set(approvementTopicBinding.bindTopic, Object.freeze(approvementTopicBinding));
				}

				return Object.freeze<Settings.Messenger.Telegram>({
					type: messengerType,
					name: messengerName,
					apiToken: messengerConfiguration.get("apiToken").asString,
					approvementTopicBindings
				});
			}
			default:
				throw new Settings.Messenger.UnreachableMessengerType(messengerType);
		}
	}

	protected static readApprovementTopic(topicConfiguration: FConfiguration): ApprovementTopic {
		const topicName: string | null = topicConfiguration.namespaceParent;
		if (topicName == null) { throw new FExceptionInvalidOperation("Topic configuration must be an array item (contains namespaceParent). BUG?!"); }

		return Object.freeze<ApprovementTopic>({
			name: topicName,
			description: topicConfiguration.get("description").asString,
			requireVotes: topicConfiguration.get("requireVotes").asInteger,
			expireTimeout: topicConfiguration.get("expireTimeout").asInteger,
			authType: topicConfiguration.has("authType") ? topicConfiguration.get("authType").asString : null,
			schema: topicConfiguration.has("schema") ? topicConfiguration.get("schema").asString : null
		});
	}

	protected static readUrlConnectivity(urlConnectivityConfiguration: FConfiguration): Settings.URLConnectivity {
		const url: URL = urlConnectivityConfiguration.get("url").asUrl;
		const ignoreStartupFailedConnection: boolean | null = urlConnectivityConfiguration
			.get("ignoreStartupFailedConnection")
			.asBooleanNullable;

		{ // local scope
			const userConfigurationValue: FConfigurationValue = urlConnectivityConfiguration.get("user", null);
			const user: string | null = userConfigurationValue.asStringNullable;
			if (user !== null && user !== "") {
				if (url.username !== "") {
					throw new FConfigurationException(
						"Unable to override URL username. Define separate 'user' property may be used with empty URL username only.",
						userConfigurationValue.key,
					);
				}
				url.username = encodeURIComponent(user);
			}
		}

		{ // local scope
			const passwordConfigurationValue: FConfigurationValue = urlConnectivityConfiguration.get("password", null);
			const password: string | null = passwordConfigurationValue.asStringNullable;
			if (password !== null && password !== "") {
				if (url.password !== "") {
					throw new FConfigurationException(
						"Unable to override URL password. Define separate 'password' property may be used with empty URL password only.",
						passwordConfigurationValue.key,
					);
				}
				url.password = encodeURIComponent(password);
			}
		}

		return Object.freeze<Settings.URLConnectivity>({
			url,
			ignoreStartupFailedConnection: ignoreStartupFailedConnection !== null && ignoreStartupFailedConnection,
		});
	}
}

export namespace Settings {
	export interface Cors {
		readonly methods: ReadonlyArray<string>;
		readonly whiteList: ReadonlyArray<string>;
		readonly allowedHeaders: ReadonlyArray<string>;
	}

	export namespace Endpoint {
		export interface Base extends FHostingSettings.BindEndpoint, FHostingSettings.ServerEndpoint {
			readonly type: string;
			readonly name: string;
			readonly useLogger: boolean;
		}

		export interface Api extends Base {
			readonly cors: Cors | null;
		}

		export interface Auditable extends Base {
			readonly audit: {
				readonly maxCacheSize: number;
			} | null;
		}

		export interface Monitoring extends Base {
			readonly type: "monitoring";
		}

		export interface Probe extends Base {
			readonly type:
			| "liveness"
			| "readiness";
		}

		export interface Info extends Api {
			readonly type: "info";
		}

		export interface Rest extends Api, Auditable {
			readonly type: "rest";
		}

		export interface Static extends Base {
			readonly type: "welcome-page";
		}

		export interface WebSocket extends Base, FHostingSettings.WebSocketEndpoint {
			readonly type: "websocket";
		}
	}
	export type Endpoint = Endpoint.Monitoring | Endpoint.Info | Endpoint.Probe | Endpoint.Rest | Endpoint.Static | Endpoint.WebSocket;


	export namespace Messenger {
		export namespace Common {
			export interface ApprovementTopicBinding {
				readonly bindTopic: ApprovementTopicName;
				readonly renderTemplate: string;
			}
		}
		export interface Common {
			readonly type: string;
			readonly name: string;
			readonly approvementTopicBindings: ReadonlyMap<
				ApprovementTopicName,
				Common.ApprovementTopicBinding
			>;
		}
		export interface Slack extends Common {
			readonly type: "slack";
			// TODO
		}
		export namespace Telegram {
			export interface ApprovementTopicBinding extends Common.ApprovementTopicBinding {
				readonly chatId: string;
				readonly approvers: Set<string> | null;
			}
		}
		export interface Telegram extends Common {
			readonly type: "telegram";
			readonly apiToken: string;
			readonly approvementTopicBindings: ReadonlyMap<
				ApprovementTopicName,
				Telegram.ApprovementTopicBinding
			>;
		}

		export class UnreachableMessengerType extends FException {
			public constructor(messenger: never) {
				super(`Wrong messenger type: ${JSON.stringify(messenger)}.`);
			}
		}
	}
	export type Messenger = Messenger.Slack | Messenger.Telegram;
	export type MessengerMap = ReadonlyMap<Settings.Messenger["name"], Settings.Messenger>;

	export interface URLConnectivity {
		url: URL;
		ignoreStartupFailedConnection: boolean;
	}
}

export class ConfigurationException extends FException {
}

export class UnreachableNotSupportedEndpointException extends ConfigurationException {
	public constructor(endpointType: never) {
		super(`Non supported endpoint type: ${JSON.stringify(endpointType)}`);
	}
}

const IN_MEMORY_DATABASE_URL_CONNECTIVITY = Object.freeze<Settings.URLConnectivity>({
	ignoreStartupFailedConnection: false,
	url: new URL("memory://"),
});
