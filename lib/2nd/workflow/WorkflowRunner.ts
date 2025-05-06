import {
	FCancellationException,
	FException,
	FExceptionAggregate,
	FExceptionInvalidOperation,
	FExecutionContext,
	FInitableBase,
	FLogger,
	FLoggerLabelsExecutionContext,
	FSleep,
} from '@freemework/common';

import { BugDetectedError } from './common.js';
import { WorkflowApplication } from './workflow_application.js';
import { WorkflowCache } from './workflow_cache.js';
import { WorkflowDatabaseFactory, WorkflowDatabase } from './workflow_database.js';
import { WorkflowIdentifier } from './identifiers.js';

const WORKER_TICK_SLEEP_TIMEOUT = 1000;
// const SQL_SYNC_TICKS = 32;
const SQL_SYNC_TICKS = 1;

export class WorkflowRunner extends FInitableBase {
	private static _instance: WorkflowRunner | null = null;
	private readonly _log: FLogger;
	private readonly _tags: ReadonlyArray<string>;
	private readonly _workflowCache: WorkflowCache;
	private readonly _workflowDatabaseFactory: WorkflowDatabaseFactory;
	private _sqlSyncTickCounter: number;
	private _nextWorkerTickTimeout: NodeJS.Timeout | null;
	private _nextWorkerTickSleep: number;
	private _currentJob: Promise<void> | null;

	public static getInstance(): WorkflowRunner {
		if (WorkflowRunner._instance === null) {
			throw new FExceptionInvalidOperation('WorkflowExecutor was not created yet.');
		}
		return WorkflowRunner._instance;
	}

	public constructor(
		workflowCache: WorkflowCache,
		workflowDatabaseFactory: WorkflowDatabaseFactory,
		workerTags: ReadonlyArray<string>,
	) {
		if (WorkflowRunner._instance !== null) {
			throw new FExceptionInvalidOperation('WorkflowExecutor is singleton');
		}
		super();
		WorkflowRunner._instance = this;
		this._log = FLogger.create(this.constructor.name);

		this._workflowCache = workflowCache;
		this._workflowDatabaseFactory = workflowDatabaseFactory;
		this._tags = Object.freeze([...new Set(workerTags)]);

		this._nextWorkerTickTimeout = null;
		this._nextWorkerTickSleep = WORKER_TICK_SLEEP_TIMEOUT;
		this._currentJob = null;
		this._sqlSyncTickCounter = 0;
	}

	public get tags(): ReadonlyArray<string> {
		return this._tags;
	}

	public async lockWorkflowApplication(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
	): Promise<WorkflowApplication> {
		//
		return await WorkflowApplication.lockWorkflowApplication(
			executionContext,
			this._workflowCache,
			this._workflowDatabaseFactory,
			this._tags,
			workflowId,
		);
	}

	public async resumeBreakpoint(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
		breakpointOid: string,
	): Promise<void> {
		await this._workflowCache.resumeBreakpoint(executionContext, workflowId, breakpointOid);
	}

	protected onInit(): void {
		this._nextWorkerTickTimeout = setTimeout(this.safeBackgroundWorkerScheduler.bind(this), this._nextWorkerTickSleep);
	}

	protected async onDispose(): Promise<void> {
		if (this._nextWorkerTickTimeout !== null) {
			clearTimeout(this._nextWorkerTickTimeout);
			this._nextWorkerTickTimeout = null;
		}
		if (this._currentJob !== null) {
			try {
				await this._currentJob;
			} catch (e) {
				if (!(e instanceof FCancellationException)) {
					const err: FException = FException.wrapIfNeeded(e);
					if (this._log.isErrorEnabled || this._log.isDebugEnabled) {
						const msg = `Unexpected job error at dispose: ${err.message}`;
						this._log.debug(this.initExecutionContext, msg, err);
						this._log.error(this.initExecutionContext, msg);
					} else {
						console.error(e);
					}
				}
			}
		}
	}

	// @Bind
	private async safeBackgroundWorkerScheduler() {
		if (this._nextWorkerTickTimeout !== null) {
			clearTimeout(this._nextWorkerTickTimeout);
			this._nextWorkerTickTimeout = null;
		}
		try {
			if (this._currentJob !== null) {
				// !!!Force crash the service, to prevent damage!!!
				throw new BugDetectedError(
					'BUG Detected. Broken WorkflowExecutor. safeBackgroundWorkerScheduler called when this._currentJob !== null',
				);
			}

			this._currentJob = this.backgroundWorker();
			await this._currentJob;
		} catch (e) {
			if (!(e instanceof FCancellationException)) {
				const err: FException = FException.wrapIfNeeded(e);
				if (this._log.isErrorEnabled || this._log.isDebugEnabled) {
					const msg = `Unexpected job error: ${err.message}`;
					this._log.debug(this.initExecutionContext, msg, err);
					this._log.error(this.initExecutionContext, msg);
				} else {
					console.error(e);
				}
			}
		} finally {
			if (this._currentJob === null) {
				// !!!Force crash the service, to prevent damage!!!
				throw new BugDetectedError(
					'BUG Detected. Broken WorkflowExecutor. Unexpected state after job completed: this._currentJob === null.',
				);
			}

			this._currentJob = null;

			if (this.disposing === false) {
				// Ok, not disposed yet
				this._nextWorkerTickTimeout = setTimeout(this.safeBackgroundWorkerScheduler.bind(this), this._nextWorkerTickSleep); // schedule next tick
			}
		}
	}

	private async backgroundWorker() {
		this._sqlSyncTickCounter += 1;
		if (this._sqlSyncTickCounter > SQL_SYNC_TICKS) {
			this._sqlSyncTickCounter = 0;
			await WorkflowApplication.syncActiveWorkflowApplicationToRedis(this.initExecutionContext, this._workflowCache, this._workflowDatabaseFactory);
		}

		const wfApp: WorkflowApplication | null = await WorkflowApplication.lockNextWorkflowApplication(
			this.initExecutionContext,
			this._workflowCache,
			this._workflowDatabaseFactory,
			this._tags,
		);

		if (wfApp !== null) {
			const executionContext: FExecutionContext = new FLoggerLabelsExecutionContext(this.initExecutionContext, {
				workflowUuid: wfApp.workflowUuid,
			});
			// === JUST FOR DEBUG ===
			// if (wfApp.currentActivity instanceof BreakpointActivity) {
			// 	await Fsleep(this._shutdownCancellationTokenSource.token, 30000);
			// }
			// ======================

			let performErr: FException | null = null;
			try {
				this._log.info(executionContext, 'Perform workflow tick.');
				await this._workflowDatabaseFactory.using(executionContext,
					(dbExecutionContext, workflowDatabase) =>
						wfApp.perform(dbExecutionContext, workflowDatabase, this._tags)
				);
				await FSleep(this.initExecutionContext, 50);
			} catch (e) {
				performErr = FException.wrapIfNeeded(e);
				const msg = 'Workflow Application has been crashed.';
				if (this._log.isDebugEnabled || this._log.isInfoEnabled) {
					this._log.info(executionContext, msg);
					this._log.debug(executionContext, msg, performErr);
				} else {
					console.error(performErr);
				}
			}

			try {
				await wfApp.unlock(FExecutionContext.Default);
			} catch (e) {
				console.error(e);
				if (performErr !== null) {
					throw new FExceptionAggregate([FException.wrapIfNeeded(e), performErr]);
				}
				throw e; // re-throw
			}
		}

		// await FSleep(this.initExecutionContext, 500);
	}
}
