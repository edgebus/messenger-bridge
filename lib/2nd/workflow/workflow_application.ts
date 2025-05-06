import {
	FEnsureException,
	FException,
	FExceptionAggregate,
	FExceptionArgument,
	FExceptionInvalidOperation,
	FExecutionContext,
	FLogger,
	FLoggerLabelsExecutionContext,
} from '@freemework/common';
import os from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';

import { NamedBreakpointActivity, NativeBreakpointActivity } from './activities/BreakpointActivity.js';
import { WorkflowVirtualMachine1Impl } from './internal/WorkflowVirtualMachine1Impl.js';
import { Activity, BreakpointActivity, DataContextActivity, NativeActivity } from './activities/index.js';
// import { WorkflowModel } from './models.js';
import { Workflow, WorkflowTick, WorkflowStatus } from "./workflow_model.js"
import { WorkflowCache } from './workflow_cache.js';
import { WorkflowVirtualMachine } from './WorkflowVirtualMachine.js';
import { WorkflowDatabaseFactory, WorkflowDatabase } from './workflow_database.js';
import { ActivityIdentifier, WorkflowIdentifier, WorkflowTickIdentifier } from './identifiers.js';

const __dirname: string = import.meta.dirname;
const LOCK_TIMEOUT_SECONDS = 64;

export class WorkflowApplication<TDataContext = {}> {
	private static _lockInstanceName: string | null = null;
	private readonly _workflowCache: WorkflowCache;
	// private readonly _workflowDatabaseFactory: WorkflowDatabaseFactory;
	private readonly _logger: FLogger;
	private readonly _workflowUuid: string;
	private readonly _wvm: WorkflowVirtualMachine;
	private _status: WorkflowStatus;
	private _lastTickDate: Date;
	/**
	 * false after persist
	 */
	private _isDirty: boolean;
	private _isUnlocked: boolean;
	private _prevTickId: WorkflowTickIdentifier | null;

	public static async syncActiveWorkflowApplicationToRedis(
		executionContext: FExecutionContext,
		workflowCache: WorkflowCache,
		workflowDatabaseFactory: WorkflowDatabaseFactory,
	): Promise<void> {
		const activeWfAppUuids: Array<string> = await workflowCache.getActiveWorkflowApplications(executionContext);

		// const notSyncedWfApps: Array<WorkflowModel> = await FSqlConnectionFactoryExecutionContext.of(
		//   executionContext,
		// ).sqlConnectionFactory.usingConnection(
		//   executionContext,
		//   (usingExecutionContext: FExecutionContext, sqlConnection: FSqlConnection) =>
		//     WorkflowDatabase.fromSqlConnection(sqlConnection).getActiveWorkflowApplications(
		//       usingExecutionContext,
		//       {
		//         exclude: activeWfAppUuids,
		//       },
		//     ),
		// );
		const notSyncedWfApps: Array<Workflow & WorkflowTick> = await workflowDatabaseFactory.using(executionContext,
			async (dbExecutionContext: FExecutionContext, workflowDatabase: WorkflowDatabase) =>
				workflowDatabase.getActiveWorkflowApplications(
					dbExecutionContext,
					{
						exclude: activeWfAppUuids.map(WorkflowIdentifier.fromUuid),
					},
				)
		);

		if (notSyncedWfApps.length > 0) {
			for (const notSyncedWfApp of notSyncedWfApps) {
				await workflowCache.updateAndLockWorkflowApplication(
					executionContext,
					WorkflowApplication.lockInstanceName,
					notSyncedWfApp,
					null,
				);
				await workflowCache.unlockWorkflowApplication(
					executionContext,
					WorkflowApplication.lockInstanceName,
					notSyncedWfApp.workflowId,
					false,
				);
			}
		}
	}

	public static async lockWorkflowApplication(
		executionContext: FExecutionContext,
		workflowCache: WorkflowCache,
		workflowDatabaseFactory: WorkflowDatabaseFactory,
		workerTags: ReadonlyArray<string>,
		workflowId: WorkflowIdentifier,
	): Promise<WorkflowApplication> {
		// await using db = await workflowDatabaseFactory.create(executionContext);

		return await workflowDatabaseFactory.using(executionContext,
			async (usingExecutionContext: FExecutionContext, workflowDatabase: WorkflowDatabase): Promise<WorkflowApplication> => {
				const workflowModel: Workflow & WorkflowTick = await workflowDatabase.getWorkflowById(
					usingExecutionContext,
					workflowId,
				);

				const { workflowActivityId } = workflowModel;
				const ActivityClass: Activity.Constructor = Activity.getActivityConstructor(workflowActivityId.uuid);
				const entryPointActivity: Activity = new ActivityClass();
				if (!(entryPointActivity instanceof NativeActivity)) {
					throw new FExceptionInvalidOperation("Something wrong. Entrypoint activity is not NativeActivity.");
				}

				await workflowCache.lockWorkflowApplication(
					executionContext,
					WorkflowApplication.lockInstanceName,
					LOCK_TIMEOUT_SECONDS,
					workerTags,
					workflowId,
				);
				// try {

				const vmData = workflowModel.workflowTickVirtualMachineSnapshot;
				return new WorkflowApplication(
					workflowCache,
					entryPointActivity,
					{
						workflowUuid: workflowId.uuid,
						vmData,
						prevTickId: workflowModel.workflowTickId,
						status: workflowModel.workflowTickStatus,
					},
					false,
				);
				// } catch (e1) {
				// 	try {
				// 		await workflowCache.unlockWorkflowApplication(
				// 			executionContext,
				// 			WorkflowApplication.lockInstanceName,
				// 			workflowId,
				// 			false,
				// 		);
				// 	} catch (e2) {
				// 		const err1 = FException.wrapIfNeeded(e1);
				// 		const err2 = FException.wrapIfNeeded(e2);
				// 		throw new FExceptionAggregate([err1, err2]);
				// 	}
				// 	throw e1;
				// }
			}
		);
	}

	public static async lockNextWorkflowApplication(
		executionContext: FExecutionContext,
		workflowCache: WorkflowCache,
		workflowDatabaseFactory: WorkflowDatabaseFactory,
		workerTags: ReadonlyArray<string>,
	): Promise<WorkflowApplication | null> {
		while (true) {
			// Loop for case: Redis contains stale data

			const workflowId: WorkflowIdentifier | null = await workflowCache.lockNextWorkflowApplication(
				executionContext,
				WorkflowApplication.lockInstanceName,
				LOCK_TIMEOUT_SECONDS,
				workerTags,
			);
			if (workflowId === null) {
				return null;
			}

			try {
				const workflowUuid = workflowId.uuid;

				// const workflowModel: WorkflowModel | null = await FSqlConnectionFactoryExecutionContext.of(
				// 	executionContext,
				// ).sqlConnectionFactory.usingConnection(
				// 	executionContext,
				// 	(usingExecutionContext: FExecutionContext, sqlConnection: FSqlConnection) =>
				// 		WorkflowDatabase.fromSqlConnection(sqlConnection).findWorkflowById(
				// 			usingExecutionContext,
				// 			workflowUuid,
				// 		),
				// );

				const workflowModel: Workflow & WorkflowTick | null = await workflowDatabaseFactory.using(executionContext,
					(usingExecutionContext: FExecutionContext, workflowDatabase: WorkflowDatabase) =>
						workflowDatabase.findWorkflowById(
							usingExecutionContext,
							workflowId,
						)
				);

				if (workflowModel === null) {
					// Looks like Redis contains stale data. Cleanup.
					await workflowCache.cleanupWorkflowApplication(
						executionContext,
						WorkflowApplication.lockInstanceName,
						workflowId,
					);
					continue;
				} else {
					const { workflowActivityId } = workflowModel;
					const ActivityClass: Activity.Constructor = Activity.getActivityConstructor(workflowActivityId.uuid);
					const entryPointActivity: Activity = new ActivityClass();
					if (!(entryPointActivity instanceof NativeActivity)) {
						// TODO: crash this wf app
						console.error('Broken Workflow Engine');
						return null;
					}

					const vmData = workflowModel.workflowTickVirtualMachineSnapshot;

					return new WorkflowApplication(workflowCache, entryPointActivity, {
						workflowUuid,
						vmData,
						prevTickId: workflowModel.workflowTickId,
						status: workflowModel.workflowTickStatus,
					});
				}
			} catch (e1) {
				try {
					await workflowCache.unlockWorkflowApplication(
						executionContext,
						WorkflowApplication.lockInstanceName,
						workflowId,
						false,
					);
				} catch (e2) {
					const err1 = FException.wrapIfNeeded(e1);
					const err2 = FException.wrapIfNeeded(e2);
					throw new FExceptionAggregate([err1, err2]);
				}
				throw e1;
			}
		}
	}

	public static create(
		workflowCache: WorkflowCache,
		entryPoint: NativeActivity,
		workflowUuid?: string,
	): WorkflowApplication {
		return new WorkflowApplication(workflowCache, entryPoint, {
			...(workflowUuid !== undefined ? { workflowUuid } : {}),
			dataContext: {},
		});
	}

	public static createWithInitializer<TDataContext>(
		workflowCache: WorkflowCache,
		entryPoint: DataContextActivity<TDataContext>,
		initialize: WorkflowApplication.Initialize<TDataContext>,
	): WorkflowApplication {
		return new WorkflowApplication(workflowCache, entryPoint, initialize);
	}

	public static restore(
		workflowCache: WorkflowCache,
		entryPoint: NativeActivity,
		restore: WorkflowApplication.Restore,
	): WorkflowApplication {
		return new WorkflowApplication(workflowCache, entryPoint, restore);
	}

	private static get lockInstanceName(): string {
		if (this._lockInstanceName === null) {
			this._lockInstanceName =
				process.env["NODE_ENV"] !== 'production'
					? `${os.hostname()}:${path.normalize(path.join(__dirname, '..', '..', '..', '..'))}`
					: `${os.hostname()}:pid${process.pid}`;
		}

		return this._lockInstanceName;
	}

	private constructor(
		workflowCache: WorkflowCache,
		// workflowDatabaseFactory: WorkflowDatabaseFactory,
		entryPoint: NativeActivity,
		workflowUuidOrRestoreOrInitialize?:
			| string
			| WorkflowApplication.Initialize<TDataContext>
			| WorkflowApplication.Restore,
		isDirty: boolean = true,
	) {
		this._logger = FLogger.create(this.constructor.name);
		this._workflowCache = workflowCache;
		// this._workflowDatabaseFactory = workflowDatabaseFactory;

		if (workflowUuidOrRestoreOrInitialize !== undefined) {
			if (typeof workflowUuidOrRestoreOrInitialize === "string") {
				this._workflowUuid = workflowUuidOrRestoreOrInitialize;
				this._prevTickId = null;
				this._wvm = new WorkflowVirtualMachine1Impl(entryPoint, null);
				this._status = WorkflowStatus.WORKING;
			} else if ('prevTickId' in workflowUuidOrRestoreOrInitialize) {
				const restore: WorkflowApplication.Restore = workflowUuidOrRestoreOrInitialize;
				this._workflowUuid = restore.workflowUuid;
				this._prevTickId = restore.prevTickId;
				this._wvm = new WorkflowVirtualMachine1Impl(entryPoint, restore.vmData);
				this._status = restore.status;// WorkflowStatus.parse(restore.status);
			} else {
				const initialize: WorkflowApplication.Initialize<TDataContext> = workflowUuidOrRestoreOrInitialize;
				const { workflowUuid } = initialize;
				this._workflowUuid = workflowUuid !== undefined ? workflowUuid : uuid();
				this._prevTickId = null;
				this._wvm = new WorkflowVirtualMachine1Impl(entryPoint, null);
				if (entryPoint instanceof DataContextActivity) {
					const dataContextConstructor = entryPoint.dataContextFactory;
					if (dataContextConstructor !== null) {
						dataContextConstructor.initDataContext(this._wvm, initialize.dataContext);
					}
				}
				this._status = WorkflowStatus.WORKING;
			}
		} else {
			this._workflowUuid = uuid();
			this._prevTickId = null;
			this._wvm = new WorkflowVirtualMachine1Impl(entryPoint, null);
			this._status = WorkflowStatus.WORKING;
		}

		this._lastTickDate = new Date();
		this._isDirty = isDirty;
		this._isUnlocked = false;
	}

	public get currentExecutionContext(): WorkflowVirtualMachine.Context {
		this.verifyLocked();

		if (!this._wvm.isPaused) {
			throw new FExceptionInvalidOperation(
				'Wrong operation at current state. A currentExecutionContext is available in pause-state(non-in-tick) only.',
			);
		}

		if (this._wvm.isTerminated) {
			throw new FExceptionInvalidOperation('Wrong operation at current state. A WorkflowVirtualMachine is terminated.');
		}

		return this._wvm;
	}

	public get currentActivity(): Activity {
		this.verifyLocked();

		if (!this._wvm.isPaused) {
			throw new FExceptionInvalidOperation(
				'Wrong operation at current state. A currentExecutionContext is available in pause-state(non-in-tick) only.',
			);
		}

		if (this._wvm.isTerminated) {
			throw new FExceptionInvalidOperation('Wrong operation at current state. A WorkflowVirtualMachine is terminated.');
		}

		return this._wvm.currentActivity;
	}

	public get currentBreakpointActivity(): BreakpointActivity {
		this.verifyLocked();

		const { currentActivity } = this;
		if (currentActivity instanceof BreakpointActivity) {
			return currentActivity;
		}

		throw new FExceptionInvalidOperation('Wrong operation. Due currentActivity is not a BreakpointActivity.');
	}

	public get state(): WorkflowStatus {
		this.verifyLocked();
		return this._status;
	}

	public get workflowUuid(): string {
		this.verifyLocked();
		return this._workflowUuid;
	}

	public defineVariable(name: string, value: WorkflowVirtualMachine.Value) {
		this.verifyLocked();
		this._isDirty = true;
		this._wvm.variables.defineGlobal(name, value);
	}

	public async disableBreakpoint(_executionContext: FExecutionContext, breakpointName: string): Promise<void> {
		this.verifyLocked();

		if (this._wvm.isTerminated) {
			throw new FExceptionInvalidOperation('Cannot resume breakpoint on terminated workflow');
		}
		const breakpointActivity: NamedBreakpointActivity | undefined = this._wvm.breakpoints.get(breakpointName);
		if (breakpointActivity === undefined) {
			throw new FExceptionInvalidOperation(`Wrong breakpoint '${breakpointName}'. Not found.`);
		}

		breakpointActivity.createElement(this._wvm).isEnabled = false;
	}

	public getVariableBoolean(name: string): boolean {
		this.verifyLocked();
		return this._wvm.variables.getBoolean(name);
	}

	public getVariableInteger(name: string): number {
		this.verifyLocked();
		return this._wvm.variables.getInteger(name);
	}

	public getVariableNumber(name: string): number {
		this.verifyLocked();
		return this._wvm.variables.getNumber(name);
	}

	public getVariableString(name: string): string {
		this.verifyLocked();
		return this._wvm.variables.getString(name);
	}

	public async enableBreakpoint(_executionContext: FExecutionContext, breakpointName: string): Promise<void> {
		this.verifyLocked();

		if (this._wvm.isTerminated) {
			throw new FExceptionInvalidOperation('Cannot resume breakpoint on terminated workflow');
		}
		const breakpointActivity: NamedBreakpointActivity | undefined = this._wvm.breakpoints.get(breakpointName);
		if (breakpointActivity === undefined) {
			throw new FExceptionInvalidOperation(`Wrong breakpoint '${breakpointName}'. Not found.`);
		}

		breakpointActivity.createElement(this._wvm).isEnabled = true;
	}

	public async perform(
		executionContext: FExecutionContext,
		workflowDb: WorkflowDatabase,
		nextTickTags: ReadonlyArray<string>,
		opts?: {
			/**
			 * Прервать тики, при достижении ближайшего BreakpointActivity
			 * !!! Ни один тик из BreakpointActivity не выполяется !!!
			 * т.е. перываение должно случиться ПЕРЕД выполнением BreakpointActivity
			 */
			readonly breakOnFirstBreakpoint: boolean;
		},
	): Promise<void> {
		if (this._wvm.isTerminated) {
			throw new FExceptionInvalidOperation('Cannot start terminated workflow');
		}

		executionContext = new FLoggerLabelsExecutionContext(executionContext, { workflowUuid: this.workflowUuid });

		let prevActivity: Activity | null = null;
		let activityHangsCounter = 0;
		while (true) {
			try {
				if (opts !== undefined && opts.breakOnFirstBreakpoint === true) {
					if (this._wvm.currentActivity instanceof BreakpointActivity) {
						// break on first breakpoint
						return;
					}
				}

				if (prevActivity === this._wvm.currentActivity) {
					++activityHangsCounter;
				} else {
					prevActivity = this._wvm.currentActivity;
					activityHangsCounter = 0;
				}

				this._isDirty = true;

				const tickActivity: Activity = this._wvm.currentActivity;
				if (tickActivity instanceof BreakpointActivity) {
					const isApprovedCurrentBreakpoint = await this._workflowCache.isApprovedBreakpoint(
						executionContext,
						WorkflowIdentifier.fromUuid(this._workflowUuid),
						tickActivity.oid, // this._wvm.getActivityOid(currentActivity)
					);
					if (isApprovedCurrentBreakpoint) {
						// Turn-off Breakpoint (allow execution)
						tickActivity.createElement(this._wvm).isEnabled = false;
					}
				}

				this._status = WorkflowStatus.WORKING;

				if (this._logger.isDebugEnabled) {
					const activityTypeName: string = tickActivity.constructor.name;
					this._logger.debug(executionContext, `Schedule tick for activity '${activityTypeName}'.`);
				}
				if (this._logger.isTraceEnabled) {
					const contextData: any = this._wvm.toJSON();
					this._logger.debug(executionContext, `State before tick: '${JSON.stringify(contextData)}'`);
				}
				const isIdle: boolean = await this._wvm.tick(executionContext);
				if (this._logger.isTraceEnabled) {
					const contextData: any = this._wvm.toJSON();
					this._logger.debug(executionContext, `State after tick: '${JSON.stringify(contextData)}'`);
				}

				this._lastTickDate = new Date();

				if (this._wvm.isTerminated) {
					this._status = WorkflowStatus.TERMINATED;
				} else if (isIdle) {
					if (this._wvm.currentActivity instanceof NativeBreakpointActivity) {
						// // В состоянии сна, может быть выполнено еще несколько тиков (напрмер отсылка мерчанту нотификации)
						// // Т.е. в состоянии SLEEPING выполняются все тики, пока BreakpointActivity не перейдет в isIdle
						// isIdle = this._wvm.currentActivity.createElement(this._wvm).isIdle;

						this._status = WorkflowStatus.SLEEPING;
					}
				}

				const workflowModel: WorkflowTick = await this.persist(executionContext, workflowDb, nextTickTags, this._prevTickId);
				this._logger.trace(executionContext, () => `Workflow '${workflowModel.workflowId.value}' was persisted.`);

				if (isIdle || this._wvm.isTerminated) {
					const activityTypeName: string = tickActivity.constructor.name;

					if (this._logger.isDebugEnabled && isIdle) {
						this._logger.debug(executionContext, `Application idle on activity '${activityTypeName}'.`);
					}
					if (this._logger.isInfoEnabled && this._wvm.isTerminated) {
						this._logger.debug(executionContext, `Application terminated on activity '${activityTypeName}'.`);
					}

					return; // Nothing to do due idle/terminated
				}

				if (prevActivity !== null && activityHangsCounter >= 16) {
					if (this._logger.isErrorEnabled) {
						const msg = `An hangs activity detected. The activity oid:'${prevActivity.oid}' of type '${prevActivity.constructor.name}' in workflow application '${prevActivity.root.children[0]!.constructor.name}' is executes 16 times. Force idle state.`;
						this._logger.error(
							executionContext,
							msg,
						);
					}
					return;
				}
			} catch (e) {
				this._lastTickDate = new Date();
				this._status = WorkflowStatus.CRASHED;
				const err: FException = FException.wrapIfNeeded(e);

				console.error(err);
				this._logger.error(executionContext, err.message);
				this._logger.debug(executionContext, err.message, err);

				let crashReport: string = err.message;
				if (err instanceof FException) {
					let promotionErr: Error | null = err.innerException;
					while (promotionErr !== null) {
						crashReport = `${crashReport}\n${promotionErr.message}`;
						promotionErr = promotionErr instanceof FException ? promotionErr.innerException : null;
					}
				}

				await this.persist(executionContext, workflowDb, nextTickTags, this._prevTickId, crashReport);

				return;
			}
		}
	}

	public setVariable(name: string, value: boolean | number | string | null) {
		this.verifyLocked();
		this._isDirty = true;
		this._wvm.variables.set(name, value);
	}

	public async persist(
		executionContext: FExecutionContext,
		dbFacade: WorkflowDatabase,
		nextTickTags: ReadonlyArray<string>,
		prevTickId: WorkflowTickIdentifier | null = null,
		crashReport: string | null = null,
	): Promise<WorkflowTick & WorkflowTick> {
		this.verifyLocked();

		const { latestExecutedBreakpoint } = this._wvm;

		let workflowData: Workflow.Data & WorkflowTick.Data;

		{
			// local scope
			const workflowDataBaseData: Workflow.Data & WorkflowTick.Data._Base = {
				workflowId: WorkflowIdentifier.fromUuid(this._workflowUuid),
				workflowActivityId: ActivityIdentifier.fromUuid(this._wvm.entryPointActivity.activityUUID),
				workflowActivityVersion: Activity.appVersion,
				// workflowTickPrevId: prevTickId,
				workflowTickVirtualMachineSnapshot: this._wvm.toJSON(),
				workflowTickLatestExecutedBreakpoint: latestExecutedBreakpoint !== null ? latestExecutedBreakpoint.name : null,
				workflowTickExecutedAt: this._lastTickDate,
				workflowTickNextTickTags: nextTickTags,
			};

			if (this._status === WorkflowStatus.CRASHED) {
				if (crashReport === null) {
					throw new FExceptionArgument('Cannot persist crash state without crash report.', 'crashReport');
				}

				workflowData = {
					...workflowDataBaseData,
					workflowTickStatus: this._status,
					workflowTickCrashReport: crashReport,
				};
			} else {
				workflowData = {
					...workflowDataBaseData,
					workflowTickStatus: this._status,
					workflowTickCrashReport: null,
				};
			}
		}

		const workflowModel: WorkflowTick & WorkflowTick = await dbFacade.persistWorkflow(executionContext, workflowData, prevTickId);
		this._prevTickId = workflowModel.workflowTickId;

		let breakpoint: null | { readonly oid: string; readonly waitTimeout: number } = null;
		if (this.state === WorkflowStatus.SLEEPING && this.currentActivity instanceof NativeBreakpointActivity) {
			const { executeCounter } = NativeBreakpointActivity.of(this._wvm);
			let waitTimeout: number;
			if (executeCounter < 10) {
				waitTimeout = 30;
			} else if (executeCounter < 50) {
				waitTimeout = 60;
			} else {
				waitTimeout = 300;
			}
			breakpoint = Object.freeze({ oid: this.currentActivity.oid, waitTimeout });
		}

		await this._workflowCache.updateAndLockWorkflowApplication(
			executionContext,
			WorkflowApplication.lockInstanceName,
			workflowModel,
			breakpoint,
		);

		this._isDirty = false;

		return workflowModel;
	}

	public async unlock(executionContext: FExecutionContext): Promise<void> {
		if (this._isUnlocked === true) {
			// already unlocked
			return;
		}

		if (this._isDirty !== false) {
			throw new FExceptionInvalidOperation('Wrong usage. Cannot unlock dirty application. Try persist first.');
		}

		const removeFromProcessing: boolean =
			this._status === WorkflowStatus.TERMINATED || this._status === WorkflowStatus.CRASHED;

		await this._workflowCache.unlockWorkflowApplication(
			executionContext,
			WorkflowApplication.lockInstanceName,
			WorkflowIdentifier.fromUuid(this._workflowUuid),
			removeFromProcessing,
		);
	}

	private verifyLocked(): void {
		if (this._isUnlocked !== false) {
			throw new FExceptionInvalidOperation('Wrong usage. Cannot use unlocked application.');
		}
	}
}

export namespace WorkflowApplication {
	export interface Initialize<TDataContext> {
		readonly dataContext: TDataContext;
		readonly workflowUuid?: string;
	}
	export interface Restore {
		readonly vmData: any;
		readonly workflowUuid: string;
		readonly prevTickId: WorkflowTickIdentifier;
		readonly status: WorkflowStatus;
	}

	export class ContractViolationError extends FEnsureException {
		//
	}

	export class WorkflowNotFoundError extends FExceptionArgument {
		public readonly workflowUuid: WorkflowApplication['workflowUuid'];

		public constructor(workflowUuid: WorkflowApplication['workflowUuid']) {
			super(
				'Requested workflow application was not found. See workflowUuid property for the workflow application identifier.',
				'workflowUuid',
			);
			this.workflowUuid = workflowUuid;
		}
	}

	export class WorkflowConcurrencyError extends Error { }
}
