import {
	FExceptionInvalidOperation,
	FExecutionContext,
	FLogger,
	FSqlConnection,
	FSqlData,
	FSqlResultRecord,
	FSqlConnectionFactory,
	FExceptionAggregate,
	FException,
	FInitableBase,
} from '@freemework/common';
import { FSqlConnectionFactoryPostgres } from '@freemework/sql.postgres';

import { assertIsWorkflowStatus, Workflow, WorkflowStatus, WorkflowTick } from './workflow_model.js';
import { ActivityIdentifier, WorkflowIdentifier, WorkflowTickIdentifier } from './identifiers.js';
import { SqlContinuouslyTransaction } from '../../database/database_sql.js';

export abstract class WorkflowDatabaseFactory {
	public static fromSqlConnectionFactory(
		sqlConnectionFactory: FSqlConnectionFactory,
	): WorkflowDatabaseFactory {
		return new WorkflowSqlDatabaseFactory(sqlConnectionFactory);
	}

	public abstract create(
		executionContext: FExecutionContext
	): Promise<WorkflowDatabase>;

	public abstract using<TResult>(
		executionContext: FExecutionContext,
		workload: (
			executionContext: FExecutionContext,
			db: WorkflowDatabase,
		) => Promise<TResult>,
	): Promise<TResult>;
}

class WorkflowSqlDatabaseFactory extends WorkflowDatabaseFactory {
	public constructor(
		private readonly _sqlConnectionFactory: FSqlConnectionFactory,
	) {
		super();
		if (!(this._sqlConnectionFactory instanceof FSqlConnectionFactoryPostgres)) {
			throw new FExceptionInvalidOperation("Workflow Database supports PostgreSQL only (yet). We are sorry...");
		}
	}

	public override async create(
		executionContext: FExecutionContext
	): Promise<WorkflowDatabase> {
		const sqlConnection: FSqlConnection = await this._sqlConnectionFactory.create(executionContext);
		try {
			const db = new WorkflowDataPersistentFacadePostgres(sqlConnection);
			await db.init(executionContext);
			return db;
		} catch (e) {
			try { await sqlConnection.dispose(); }
			catch (e2) {
				throw new FExceptionAggregate([
					FException.wrapIfNeeded(e),
					FException.wrapIfNeeded(e2),
				]);
			}
			throw e;
		}
	}

	public async using<TResult>(
		executionContext: FExecutionContext,
		workload: (executionContext: FExecutionContext, db: WorkflowDatabase) => Promise<TResult>,
	): Promise<TResult> {
		return await this._sqlConnectionFactory.usingConnectionWithTransaction(
			executionContext,
			async (dbExecutionContext, sqlConnection) => {
				const db = new WorkflowDataPersistentFacadePostgres(sqlConnection);
				await db.init(executionContext);
				try {
					return await workload(dbExecutionContext, db);
				} finally {
					await db.dispose();
				}
			}
		);
	}
}


/**
 * Probably, you want to create an instance of the `WorkflowDatabase`
 * from your `DbFacade`
 */
export abstract class WorkflowDatabase extends FInitableBase {
	protected readonly log: FLogger;

	public static async fromSqlConnection(
		executionContext: FExecutionContext,
		sqlConnection: FSqlConnection,
	): Promise<WorkflowDatabase> {
		const db = new WorkflowDataPersistentFacadePostgres(sqlConnection);
		await db.init(executionContext);
		return db;
	}

	protected constructor() {
		super();
		this.log = FLogger.create(this.constructor.name);
	}

	public abstract findWorkflowById(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
	): Promise<(Workflow & WorkflowTick) | null>;

	public abstract getWorkflowById(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
	): Promise<Workflow & WorkflowTick>;

	public abstract persistWorkflow(
		executionContext: FExecutionContext,
		workflow: Workflow.Id & Workflow.Data & WorkflowTick.Data,
		prevTickId: WorkflowTickIdentifier | null,
	): Promise<Workflow & WorkflowTick>;

	public abstract getActiveWorkflowApplications(
		executionContext: FExecutionContext,
		opts: { exclude: ReadonlyArray<WorkflowIdentifier> },
	): Promise<Array<Workflow & WorkflowTick>>;
}

class WorkflowDataPersistentFacadePostgres extends WorkflowDatabase {
	public readonly sqlContinuouslyTransaction: SqlContinuouslyTransaction;

	public constructor(sqlConnectionOrFactory: FSqlConnection | FSqlConnectionFactoryPostgres) {
		super();

		this.sqlContinuouslyTransaction = new SqlContinuouslyTransaction(sqlConnectionOrFactory);

		// if (!(sqlConnection.factory instanceof FSqlConnectionFactoryPostgres)) {
		// 	throw new FExceptionInvalidOperation(
		// 		`Unsupported SQL connection type '${sqlConnection.factory.constructor.name}' for '${WorkflowDataPersistentFacadePostgres.name}'`,
		// 	);
		// }

		// this._sqlConnection = sqlConnection;
	}

	public async findWorkflowById(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
	): Promise<(Workflow & WorkflowTick) | null> {
		const sqlRow: FSqlResultRecord | null = await this.sqlContinuouslyTransaction.sqlConnection
			.statement(
				'SELECT W."uuid" AS "workflow_uuid", T."uuid" AS "tick_uuid", W."activity_uuid", W."activity_version", W."utc_created_at", T."workflow_virtual_machine_snapshot", T."workflow_status", T."latest_breakpoint", T."crash_report", T."utc_executed_at", T."next_tick_tags"' +
				' FROM "public"."workflow" AS W' +
				' INNER JOIN "public"."vw_last_workflow_tick" AS T ON W."uuid" = T."workflow_uuid"' +
				' WHERE W."uuid" = $1',
			)
			.executeSingleOrNull(executionContext, workflowId.uuid);

		return sqlRow !== null ? WorkflowDataPersistentFacadePostgres.mapWorkflowApplication(sqlRow) : null;
	}

	public async getWorkflowById(
		executionContext: FExecutionContext,
		workflowId: WorkflowIdentifier,
	): Promise<Workflow & WorkflowTick> {
		const sqlRow: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection
			.statement(`
				SELECT
					W."uuid" AS "workflow_uuid",
					T."uuid" AS "tick_uuid",
					W."activity_uuid",
					W."activity_version",
					W."utc_created_at",
					T."workflow_virtual_machine_snapshot",
					T."workflow_status",
					T."latest_breakpoint",
					T."crash_report",
					T."utc_executed_at",
					T."next_tick_tags"
				FROM "workflow" AS W
				INNER JOIN "vw_last_workflow_tick" AS T ON W."uuid" = T."workflow_uuid"
				WHERE W."uuid" = $1
			`)
			.executeSingle(executionContext, workflowId.uuid);

		return WorkflowDataPersistentFacadePostgres.mapWorkflowApplication(sqlRow);
	}

	public async persistWorkflow(
		executionContext: FExecutionContext,
		workflow: Workflow.Id & Workflow.Data & WorkflowTick.Data,
		prevTickId: WorkflowTickIdentifier | null,
	): Promise<Workflow & WorkflowTick> {
		let workflowId: string;
		let workflowCreatedAt: Date;

		const existentWorkflowRecord: FSqlResultRecord | null = await this.sqlContinuouslyTransaction.sqlConnection
			.statement('SELECT "uuid", "utc_created_at" FROM "public"."workflow" WHERE "uuid" = $1')
			.executeSingleOrNull(executionContext, workflow.workflowId.uuid);

		if (existentWorkflowRecord !== null) {
			workflowId = existentWorkflowRecord.get("uuid").asString;
			workflowCreatedAt = existentWorkflowRecord.get("utc_created_at").asDate;
		} else {
			// New workflow
			const workflowRow: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection
				.statement(
					'INSERT INTO "public"."workflow"("uuid", "activity_uuid", "activity_version")' +
					' VALUES ($1, $2, $3) ' +
					' RETURNING "uuid", "utc_created_at"',
				)
				.executeSingle(
					executionContext,
					/* 1 */ workflow.workflowId.uuid,
					/* 2 */ workflow.workflowActivityId.uuid,
					/* 3 */ workflow.workflowActivityVersion,
				);
			workflowId = workflowRow.get("uuid").asString;
			workflowCreatedAt = workflowRow.get("utc_created_at").asDate;
		}

		const workflowTickRow: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection
			.statement(
				'INSERT INTO "public"."workflow_tick"("prev_tick_uuid", "workflow_uuid", "workflow_virtual_machine_snapshot", "workflow_status", "latest_breakpoint", "crash_report" , "utc_executed_at", "next_tick_tags")' +
				' VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::DOUBLE PRECISION / 1000)::TIMESTAMP WITHOUT TIME ZONE, $8)' +
				' RETURNING "uuid", "utc_executed_at"',
			)
			.executeSingle(
				executionContext,
				/* 1 */ prevTickId !== null ? prevTickId.uuid : null,
				/* 2 */ workflowId,
				/* 3 */ { vmData: workflow.workflowTickVirtualMachineSnapshot } as any,
				/* 4 */ workflow.workflowTickStatus,
				/* 5 */ workflow.workflowTickLatestExecutedBreakpoint,
				/* 6 */ workflow.workflowTickStatus === WorkflowStatus.CRASHED ? workflow.workflowTickCrashReport : null,
				/* 7 */ workflow.workflowTickExecutedAt.getTime(),
				/* 8 */ workflow.workflowTickNextTickTags !== null ? workflow.workflowTickNextTickTags.join(',') : null,
			);
		const workflowTickId: string = workflowTickRow.get("uuid").asString;
		return Object.freeze<Workflow & WorkflowTick>({
			...workflow,
			workflowTickId: WorkflowTickIdentifier.fromUuid(workflowTickId),
			workflowCreatedAt,
		});
	}

	public async getActiveWorkflowApplications(
		executionContext: FExecutionContext,
		opts: { exclude: ReadonlyArray<WorkflowIdentifier> },
	): Promise<Array<Workflow & WorkflowTick>> {
		const sqlRows: ReadonlyArray<FSqlResultRecord> = await this.sqlContinuouslyTransaction.sqlConnection
			.statement(
				'SELECT W."uuid" AS "workflow_uuid", T."uuid" AS "tick_uuid", W."activity_uuid", W."activity_version", W."utc_created_at", T."workflow_virtual_machine_snapshot", T."workflow_status", T."latest_breakpoint", T."crash_report", T."utc_executed_at", T."next_tick_tags"' +
				' FROM "public"."workflow" AS W ' +
				' INNER JOIN "public"."vw_last_workflow_tick" AS T ON T."workflow_uuid" = W."uuid" ' +
				` WHERE T."workflow_virtual_machine_snapshot" IS NOT NULL AND T."workflow_status" IN ('WORKING','SLEEPING') AND NOT (W."uuid"::text = ANY ($1))`,
			)
			.executeQuery(executionContext, opts.exclude.map(id => id.uuid));

		return sqlRows.map(WorkflowDataPersistentFacadePostgres.mapWorkflowApplication);
	}

	protected async onInit(): Promise<void> {
		await this.sqlContinuouslyTransaction.init(this.initExecutionContext);
	}

	protected async onDispose(): Promise<void> {
		await this.sqlContinuouslyTransaction.dispose();
	}

	private static mapWorkflowApplication(sqlRow: FSqlResultRecord): Workflow & WorkflowTick {
		const nextTickTagsData = sqlRow.get('next_tick_tags').asStringNullable;
		const workflowTickId: string = sqlRow.get('tick_uuid').asString;
		const workflowId: string = sqlRow.get('workflow_uuid').asString;
		const workflowActivityId: string = sqlRow.get('activity_uuid').asString;
		const workflowActivityVersion: string = sqlRow.get('activity_version').asString;
		const workflowCreatedAt: Date = sqlRow.get('utc_created_at').asDate;
		// const workflowTickCreatedAt: Date = sqlRow.get('workflow_tick_utc_created_at').asDate;
		const workflowTickVirtualMachineSnapshot: any = sqlRow.get('workflow_virtual_machine_snapshot').asObjectNullable
			?.vmData;
		// const workflowTickPrevId: string = sqlRow.get('prev_tick_uuid').asString;

		const workflowTickStatus: string = sqlRow.get('workflow_status').asString;
		assertIsWorkflowStatus(workflowTickStatus);

		const workflowTickLatestExecutedBreakpoint: string | null = sqlRow.get('latest_breakpoint').asStringNullable;
		const workflowTickExecutedAt: Date = sqlRow.get('utc_executed_at').asDate;
		const workflowTickNextTickTags: Array<string> | null = nextTickTagsData !== null ? nextTickTagsData.split(',') : null;

		if (workflowTickStatus === WorkflowStatus.CRASHED) {
			const workflowTickCrashReport: string | null = sqlRow.get('crash_report').asStringNullable;
			return Object.freeze<Workflow & WorkflowTick>({
				workflowId: WorkflowIdentifier.fromUuid(workflowId),
				workflowActivityId: ActivityIdentifier.fromUuid(workflowActivityId),
				workflowActivityVersion,
				workflowCreatedAt,
				workflowTickId: WorkflowTickIdentifier.fromUuid(workflowTickId),
				// workflowTickPrevId: WorkflowTickIdentifier.fromUuid(workflowTickPrevId),
				workflowTickVirtualMachineSnapshot,
				workflowTickStatus,
				workflowTickLatestExecutedBreakpoint,
				// workflowTickCreatedAt,
				workflowTickExecutedAt,
				workflowTickNextTickTags,
				workflowTickCrashReport: workflowTickCrashReport !== null ? workflowTickCrashReport : 'Unknown crash',
			});
		}
		return Object.freeze<Workflow & WorkflowTick>({
			workflowId: WorkflowIdentifier.fromUuid(workflowId),
			workflowActivityId: ActivityIdentifier.fromUuid(workflowActivityId),
			workflowActivityVersion,
			workflowCreatedAt,
			workflowTickId: WorkflowTickIdentifier.fromUuid(workflowTickId),
			// workflowTickPrevId: WorkflowTickIdentifier.fromUuid(workflowTickPrevId),
			workflowTickVirtualMachineSnapshot,
			workflowTickStatus,
			workflowTickLatestExecutedBreakpoint,
			// workflowTickCreatedAt,
			workflowTickExecutedAt,
			workflowTickNextTickTags,
			workflowTickCrashReport: null,
		});
	}
}
