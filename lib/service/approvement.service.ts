import {
	FCancellationException,
	FCancellationExecutionContext,
	FCancellationTokenSourceManual,
	FDisposable,
	FException,
	FExceptionArgument,
	FExceptionInvalidOperation,
	FExecutionContext,
	FInitable,
	FInitableBase,
	FLogger,
} from "@freemework/common";

import * as _ from "lodash";
import { v4 as uuid } from "uuid";

import { Settings } from "../settings.js";
import { BaseMessenger } from "../messenger/_base.messenger.js";
import { TelegramMessenger } from "../messenger/telegram.messenger.js";
import { ApprovementId, ApprovementTopicName } from "../model/primitives.js";
import { Approvement } from "../model/approvement.js";
import { Approver } from "../model/approver.js";
import { ApprovementTopic, ApprovementTopicMap } from "../model/approvement_topic.js";
import { KeyValueDb, InMemory } from "../misc/key_value_db.js";
import { Bind } from "../utils/bind.js";

export abstract class Service extends FInitableBase {
	public abstract get approvementTopics(): ReadonlyMap<ApprovementTopicName, ApprovementTopic>;

	public abstract createApprovement(
		executionContext: FExecutionContext, approvementTopicName: string, renderData: any
	): Promise<Approvement>;

	public abstract getApprovement(
		_executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId
	): Promise<Approvement & {
		readonly status: "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED";
	}>;
}

export class ServiceImpl extends Service {
	private readonly _logger: FLogger;
	private readonly _workerSleepMs: number;
	// private readonly _configuration: Settings;
	private readonly _kbDb: KeyValueDb;
	private readonly _approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	private readonly _messengers: ReadonlyMap<Settings.Messenger["name"], BaseMessenger>;
	private readonly _activeApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _completedApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _expiredApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _disposeCancellationTokenSource: FCancellationTokenSourceManual;
	private _workerTimeout: NodeJS.Timeout | null;
	private _safeWorkerTask: Promise<void> | null;

	public constructor(settings: {
		readonly messengers: Settings.MessengerMap;
		readonly approvementTopics: ApprovementTopicMap;
	}) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		// this._configuration = configuration;
		this._disposeCancellationTokenSource = new FCancellationTokenSourceManual();
		this._workerSleepMs = 5000;
		this._workerTimeout = null;
		this._safeWorkerTask = null;

		this._kbDb = new InMemory();

		const messengers: Map<Settings.Messenger["name"], BaseMessenger> = new Map();

		this._approvementTopics = new Map();
		for (const [topicName, topicConfiguration] of settings.approvementTopics) {
			this._approvementTopics.set(topicName, topicConfiguration);
		}

		for (const [messengerName, messengerConfiguration] of settings.messengers) {
			switch (messengerConfiguration.type) {
				case "slack":
					throw new FExceptionInvalidOperation("Not implemented yet");
				case "telegram": {
					const messenger = new TelegramMessenger(
						{
							workerSleepMs: 250,
							telegramApiToken: messengerConfiguration.apiToken
						},
						{
							...messengerConfiguration,
							approvementTopics: this._approvementTopics
						},
						this._kbDb
					);

					// Check for existing approvement topics, avoid misconfiguration
					for (const approvementTopicBinding of messengerConfiguration.approvementTopicBindings.values()) {
						const approvementTopic: ApprovementTopic | undefined
							= this._approvementTopics.get(approvementTopicBinding.bindTopic);
						if (approvementTopic === undefined) {
							throw new FExceptionInvalidOperation(
								`Wrong binding approvement topic name '${approvementTopicBinding.bindTopic}' on messenger '${messengerName}'. The topic does not exist.`
							);
						}
					}

					messenger.approveEventChannel.addHandler(this._onApprove);
					messenger.refuseEventChannel.addHandler(this._onRefuse);

					messengers.set(messengerName, messenger);
					break;
				}
				default:
					throw new Settings.Messenger.UnreachableMessengerType(messengerConfiguration);

			}
		}

		this._messengers = messengers;
		this._activeApprovements = new Map();
		this._expiredApprovements = new Map();
		this._completedApprovements = new Map();
	}

	public get approvementTopics(): ReadonlyMap<ApprovementTopicName, ApprovementTopic> {
		this.verifyInitializedAndNotDisposed();

		return this._approvementTopics;
	}

	public async createApprovement(
		executionContext: FExecutionContext, approvementTopicName: string, renderData: any
	): Promise<Approvement> {
		this.verifyInitializedAndNotDisposed();

		const approvementTopic: ApprovementTopic | undefined = this._approvementTopics.get(approvementTopicName);
		if (approvementTopic === undefined) {
			throw new FExceptionArgument(
				`No approvement topic '${approvementTopicName}'.`,
				"approvementTopicName",
			);
		}

		const approvementId: ApprovementId = uuid();
		const expireAt: Date = new Date(Date.now() + approvementTopic.expireTimeout * 1000);

		const approvementMessageTokens: Array<BaseMessenger.ApprovementMessageToken> = [];
		for (const messenger of this._messengers.values()) {
			if (messenger.isBoundToApprovementTopic(approvementTopicName)) {
				const approvementMessageToken: BaseMessenger.ApprovementMessageToken = await messenger.registerApprovement(
					executionContext, approvementTopicName, approvementId, renderData
				);
				approvementMessageTokens.push(approvementMessageToken);
			}
		}

		if (approvementMessageTokens.length === 0) {
			throw new FExceptionInvalidOperation(
				`Cannot register an approvement, due no any messenger attached to topic '${approvementTopicName}'. Looks like misconfiguration.`
			);
		}

		const approvement: Approvement = {
			approvementId,
			approvementTopic,
			expireAt,
			approvedBy: Object.freeze([]),
			refuseBy: null
		};

		this._activeApprovements.set(approvementId, Object.freeze({
			approvement,
			messageTokens: approvementMessageTokens
		}));

		return approvement;
	}

	public async getApprovement(
		_executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId
	): Promise<Approvement & {
		readonly status: "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED";
	}> {
		this.verifyInitializedAndNotDisposed();

		{ // scope
			const activeApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
			if (activeApprovementBundle !== undefined) {
				if (activeApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...activeApprovementBundle.approvement,
					status: "PENDING"
				});
			}
		}

		{ // scope
			const expiredApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._expiredApprovements.get(approvementId);
			if (expiredApprovementBundle !== undefined) {
				if (expiredApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...expiredApprovementBundle.approvement,
					status: "EXPIRED"
				});
			}
		}

		{ // scope
			const completedApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._completedApprovements.get(approvementId);
			if (completedApprovementBundle !== undefined) {
				if (completedApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...completedApprovementBundle.approvement,
					status: completedApprovementBundle.approvement.refuseBy !== null ? "REFUSED" : "APPROVED"
				});
			}
		}

		throw new Service.NoSuchApprovement(approvementId);
	}

	protected async onInit(): Promise<void> {
		this._logger.debug(this.initExecutionContext, "Initializing...");
		await FInitable.initAll(this.initExecutionContext, ...this._messengers.values());
		try {
			this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
		} catch (e) {
			await FDisposable.disposeAll(...this._messengers.values());
			throw e;
		}
		this._logger.debug(this.initExecutionContext, "Initialized.");
	}

	protected async onDispose(): Promise<void> {
		this._logger.debug(this.initExecutionContext, "Disposing...");

		if (this._workerTimeout !== null) {
			clearTimeout(this._workerTimeout);
			this._workerTimeout = null;
		}

		this._disposeCancellationTokenSource.cancel();

		if (this._safeWorkerTask !== null) {
			await this._safeWorkerTask;
		}

		for (const messenger of this._messengers.values()) {
			messenger.approveEventChannel.removeHandler(this._onApprove);
			messenger.refuseEventChannel.removeHandler(this._onRefuse);
		}
		await FDisposable.disposeAll(...this._messengers.values());

		this._logger.debug(this.initExecutionContext, "Disposed");
	}

	@Bind
	private async _onApprove(executionContext: FExecutionContext, event: BaseMessenger.ApprovementEvent) {
		const logger: FLogger = this._logger;

		const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(event.approvementId);
		if (approvementBundle === undefined) {
			logger.warn(executionContext, () => `Unexpected approve event. Approvement with id '${event.approvementId}' does not register.`);
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(event.data));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(event.data)
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Clickable user detected. Data: '${event.data.toString()}'`);
			}
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Approvement '${event.approvementId}' already completed.`);
			}
			return;
		}

		const updatedApprovementBundle: ServiceInternal.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				approvedBy: Object.freeze([...new Set(approvementBundle.approvement.approvedBy), event.data])
			}),
			messageTokens: approvementBundle.messageTokens
		});


		if (updatedApprovementBundle.approvement.approvedBy.length < updatedApprovementBundle.approvement.approvementTopic.requireVotes) {
			// Update approvement

			this._activeApprovements.set(event.approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.updateApprovement(
						executionContext,
						event.approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		} else {
			// Finalize approvement

			this._activeApprovements.delete(event.approvementId);
			this._completedApprovements.set(event.approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.closeApprovementAsApprove(
						executionContext,
						event.approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		}
	}

	@Bind
	private async _onRefuse(executionContext: FExecutionContext, event: BaseMessenger.ApprovementEvent) {
		const logger: FLogger = this._logger;

		const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(event.approvementId);
		if (approvementBundle === undefined) {
			if (logger.isInfoEnabled) {
				logger.warn(executionContext, () => `Unexpected approve event. Approvement with id '${event.approvementId}' does not register.`);
			}
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(event.data));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(event.data)
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Clickable user detected. Data: '${event.data.toString()}'`);
			}
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Approvement '${event.approvementId}' already completed.`);
			}
			return;
		}

		const updatedApprovementBundle: ServiceInternal.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				refuseBy: event.data
			}),
			messageTokens: approvementBundle.messageTokens
		});

		this._activeApprovements.delete(event.approvementId);
		this._completedApprovements.set(event.approvementId, updatedApprovementBundle);

		for (const messenger of this._messengers.values()) {
			if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
				await messenger.closeApprovementAsRefuse(
					executionContext,
					event.approvementId,
					event.data
				);
			}
		}
	}

	@Bind
	private _backgroundWorker(): void {
		if (this.disposing || this.disposed) { return; }

		const logger: FLogger = this._logger;
		const executionContext = this.initExecutionContext;

		if (this._safeWorkerTask) {
			logger.error(executionContext, () => "[BUG] Illegal operation at current state. Previous worker is not completed yet.");
			return;
		}

		this._safeWorkerTask = this._backgroundWorkerJob()
			.catch(reason => {
				if (reason instanceof FCancellationException) {
					logger.debug(executionContext, () => "Worker job was cancelled.");
					return;
				}

				const err = FException.wrapIfNeeded(reason);
				logger.info(executionContext, () => `Worker job failure. Error: ${err.message}`);
				logger.trace(executionContext, () => `Worker job failure.`, err);
			})
			.finally(() => {
				this._safeWorkerTask = null;
				this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
			});
	}

	private async _backgroundWorkerJob(): Promise<void> {
		// Check for expired Approvement
		const expiredApprovements: Array<ApprovementId> = [];
		const nowTimestamp: number = Date.now();
		for (const [approvementId, approvementBundle] of this._activeApprovements) {
			if (approvementBundle.approvement.expireAt.getTime() < nowTimestamp) {
				expiredApprovements.push(approvementId);
			}
		}

		if (expiredApprovements.length > 0) {
			const executionContext: FExecutionContext = new FCancellationExecutionContext(
				FExecutionContext.Default,
				this._disposeCancellationTokenSource.token,
				true,
			);

			const logger: FLogger = this._logger;

			for (const approvementId of expiredApprovements) {
				const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
				if (approvementBundle === undefined) {
					logger.error(executionContext, () => "[BUG] Illegal operation at current state. ApprovementBundle marked for expire, but not presents inside approvements dictionary.");
					continue;
				}
				this._activeApprovements.delete(approvementId);
				this._expiredApprovements.set(approvementId, approvementBundle);

				for (const messenger of this._messengers.values()) {
					if (messenger.isBoundToApprovementTopic(approvementBundle.approvement.approvementTopic.name)) {
						await messenger.closeApprovementAsExpired(
							executionContext,
							approvementId
						);
					}
				}
			}
		}
	}
}

export namespace Service {
	export type ApprovementWithStatus = Approvement & {
		readonly status: "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED";
	};

	export class ServiceError extends Error {
		public override get name(): string {
			return this.constructor.name;
		}
	}
	export class NoSuchApprovement extends ServiceError {
		public constructor(public readonly approvementId: ApprovementId) {
			super(`No such approvement '${approvementId}'`);
		}
	}
}

namespace ServiceInternal {
	export interface ApprovementBundle {
		readonly approvement: Approvement;
		readonly messageTokens: Array<BaseMessenger.ApprovementMessageToken>;
	}
}
