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
import * as messenger from "../messenger/index.js";
import { Messenger, MessengerApprovement, TelegramMessenger } from "../messenger/index.js";
import { ApprovementId, ApprovementTopicName } from "../model/primitives.js";
import { Approvement } from "../model/approvement.js";
import { Approver } from "../model/approver.js";
import { ApprovementTopic, ApprovementTopicMap } from "../model/approvement_topic.js";
import { KeyValueDb, InMemory } from "../database/memory/memory.database.js";
import { Bind } from "../utils/bind.js";

export abstract class ApprovementService extends FInitableBase {
	public abstract get approvements(): ReadonlyMap<ApprovementTopicName, ApprovementTopic>;

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

export class ApprovementServiceImpl extends ApprovementService {
	private readonly _logger: FLogger;
	private readonly _workerSleepMs: number;
	// private readonly _configuration: Settings;
	private readonly _kbDb: KeyValueDb;
	private readonly _approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	private readonly _messengers: ReadonlyMap<Settings.Messenger["name"], Messenger>;
	private readonly _activeApprovements: Map<ApprovementId, _internal_.ApprovementBundle>;
	private readonly _completedApprovements: Map<ApprovementId, _internal_.ApprovementBundle>;
	private readonly _expiredApprovements: Map<ApprovementId, _internal_.ApprovementBundle>;
	private readonly _disposeCancellationTokenSource: FCancellationTokenSourceManual;
	private _workerTimeout: NodeJS.Timeout | null;
	private _safeWorkerTask: Promise<void> | null;

	public constructor(
		settings: {
			readonly messengers: Settings.MessengerMap;
			readonly approvements: ApprovementTopicMap;
		},
		messengerInstances: ReadonlyMap<Settings.Messenger["name"], Messenger>,
	) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		this._disposeCancellationTokenSource = new FCancellationTokenSourceManual();
		this._workerSleepMs = 5000;
		this._workerTimeout = null;
		this._safeWorkerTask = null;

		this._kbDb = new InMemory();

		this._approvementTopics = new Map();
		for (const [topicName, topicConfiguration] of settings.approvements) {
			this._approvementTopics.set(topicName, topicConfiguration);
		}

		for (const [messengerName, messenger] of messengerInstances) {
			const messengerConfiguration: Settings.Messenger | undefined = settings.messengers.get(messengerName);
			if (messengerConfiguration === undefined) {
				throw new FExceptionInvalidOperation(`Unable to find messenger '${messengerName}' configuration.`);
			}

			// Check for existing approvement topics, avoid misconfiguration
			for (const approvementTopicBinding of messengerConfiguration.approvementBindings.values()) {
				const approvementTopic: ApprovementTopic | undefined
					= this._approvementTopics.get(approvementTopicBinding.bindTopic);
				if (approvementTopic === undefined) {
					throw new FExceptionInvalidOperation(
						`Wrong binding approvement topic name '${approvementTopicBinding.bindTopic}' on messenger '${messengerName}'. The topic does not exist.`
					);
				}
			}

			messenger.approvement.addHandler(this._onApprovementDecision);
			// messenger.approveEventChannel.addHandler(this._onApprove);
			// messenger.refuseEventChannel.addHandler(this._onRefuse);
		}

		this._messengers = messengerInstances;
		this._activeApprovements = new Map();
		this._expiredApprovements = new Map();
		this._completedApprovements = new Map();
	}

	public get approvements(): ReadonlyMap<ApprovementTopicName, ApprovementTopic> {
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

		const approvementMessageTokens: Array<Messenger.ApprovementMessageToken> = [];
		for (const messenger of this._messengers.values()) {
			if (messenger.approvement.isBoundToApprovementTopic(approvementTopicName)) {
				const approvementMessageToken: Messenger.ApprovementMessageToken = await messenger.approvement.create(
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
			const activeApprovementBundle: _internal_.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
			if (activeApprovementBundle !== undefined) {
				if (activeApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new ApprovementService.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...activeApprovementBundle.approvement,
					status: "PENDING"
				});
			}
		}

		{ // scope
			const expiredApprovementBundle: _internal_.ApprovementBundle | undefined = this._expiredApprovements.get(approvementId);
			if (expiredApprovementBundle !== undefined) {
				if (expiredApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new ApprovementService.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...expiredApprovementBundle.approvement,
					status: "EXPIRED"
				});
			}
		}

		{ // scope
			const completedApprovementBundle: _internal_.ApprovementBundle | undefined = this._completedApprovements.get(approvementId);
			if (completedApprovementBundle !== undefined) {
				if (completedApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new ApprovementService.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...completedApprovementBundle.approvement,
					status: completedApprovementBundle.approvement.refuseBy !== null ? "REFUSED" : "APPROVED"
				});
			}
		}

		throw new ApprovementService.NoSuchApprovement(approvementId);
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
			messenger.approvement.removeHandler(this._onApprovementDecision);
			// messenger.approveEventChannel.removeHandler(this._onApprove);
			// messenger.refuseEventChannel.removeHandler(this._onRefuse);
		}
		await FDisposable.disposeAll(...this._messengers.values());

		this._logger.debug(this.initExecutionContext, "Disposed");
	}

	@Bind
	private async _onApprovementDecision(executionContext: FExecutionContext, event: MessengerApprovement.Event) {
		if (event.data.decision === MessengerApprovement.Decision.APPROVE) {
			return this._onApprove(executionContext, event.messenger, event.data.approvementId, event.data.approver);
		} else if (event.data.decision === MessengerApprovement.Decision.REFUSE) {
			return this._onRefuse(executionContext, event.messenger, event.data.approvementId, event.data.approver);
		} else {
			throw new FExceptionInvalidOperation();
		}
	}

	// @Bind
	private async _onApprove(executionContext: FExecutionContext, messenger: Messenger, approvementId: ApprovementId, approver: Approver) {
		const logger: FLogger = this._logger;

		const approvementBundle: _internal_.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
		if (approvementBundle === undefined) {
			logger.warn(executionContext, () => `Unexpected approve event. Approvement with id '${approvementId}' does not register.`);
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(approver));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(approver)
		) {
			logger.debug(executionContext, () => `Clickable user detected. Data: '${approver.toString()}'`);
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			logger.debug(executionContext, () => `Approvement '${approvementId}' already completed.`);
			return;
		}

		const updatedApprovementBundle: _internal_.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				approvedBy: Object.freeze([...new Set(approvementBundle.approvement.approvedBy), approver])
			}),
			messageTokens: approvementBundle.messageTokens
		});


		if (updatedApprovementBundle.approvement.approvedBy.length < updatedApprovementBundle.approvement.approvementTopic.requireVotes) {
			// Update approvement

			this._activeApprovements.set(approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.approvement.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.approvement.update(
						executionContext,
						approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		} else {
			// Finalize approvement

			this._activeApprovements.delete(approvementId);
			this._completedApprovements.set(approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.approvement.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.approvement.closeAsApprove(
						executionContext,
						approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		}
	}

	// @Bind
	private async _onRefuse(executionContext: FExecutionContext, messenger: Messenger, approvementId: ApprovementId, approver: Approver) {
		const logger: FLogger = this._logger;

		const approvementBundle: _internal_.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
		if (approvementBundle === undefined) {
			if (logger.isInfoEnabled) {
				logger.warn(executionContext, () => `Unexpected approve event. Approvement with id '${approvementId}' does not register.`);
			}
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(approver));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(approver)
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Clickable user detected. Data: '${approver.toString()}'`);
			}
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			if (logger.isDebugEnabled) {
				logger.debug(executionContext, () => `Approvement '${approvementId}' already completed.`);
			}
			return;
		}

		const updatedApprovementBundle: _internal_.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				refuseBy: approver
			}),
			messageTokens: approvementBundle.messageTokens
		});

		this._activeApprovements.delete(approvementId);
		this._completedApprovements.set(approvementId, updatedApprovementBundle);

		for (const messenger of this._messengers.values()) {
			if (messenger.approvement.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
				await messenger.approvement.closeAsRefuse(
					executionContext,
					approvementId,
					approver
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
				const approvementBundle: _internal_.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
				if (approvementBundle === undefined) {
					logger.error(executionContext, () => "[BUG] Illegal operation at current state. ApprovementBundle marked for expire, but not presents inside approvements dictionary.");
					continue;
				}
				this._activeApprovements.delete(approvementId);
				this._expiredApprovements.set(approvementId, approvementBundle);

				for (const messenger of this._messengers.values()) {
					if (messenger.approvement.isBoundToApprovementTopic(approvementBundle.approvement.approvementTopic.name)) {
						await messenger.approvement.closeAsExpired(
							executionContext,
							approvementId
						);
					}
				}
			}
		}
	}
}

export namespace ApprovementService {
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

namespace _internal_ {
	export interface ApprovementBundle {
		readonly approvement: Approvement;
		readonly messageTokens: Array<Messenger.ApprovementMessageToken>;
	}
}
