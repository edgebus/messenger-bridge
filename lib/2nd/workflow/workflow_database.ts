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
} from '@freemework/common';
import { FSqlConnectionFactoryPostgres } from '@freemework/sql.postgres';

import { WorkflowModel } from './models.js';

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
			return new WorkflowDataPersistentFacadePostgres(sqlConnection);
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
				return await workload(dbExecutionContext, db);
			}
		);
	}
}


/**
 * Probably, you want to create an instance of the `WorkflowDatabase`
 * from your `DbFacade`
 */
export abstract class WorkflowDatabase {
	protected readonly log: FLogger;

	protected constructor() {
		this.log = FLogger.create(this.constructor.name);
	}

	public abstract findWorkflowById(
		executionContext: FExecutionContext,
		workflowUuid: WorkflowModel['workflowUuid'],
	): Promise<WorkflowModel | null>;

	public abstract getWorkflowById(
		executionContext: FExecutionContext,
		workflowUuid: WorkflowModel['workflowUuid'],
	): Promise<WorkflowModel>;

	public abstract persistWorkflow(
		executionContext: FExecutionContext,
		workflow: WorkflowModel.Data & WorkflowModel.Tick,
		prevTickId: WorkflowModel['tickId'] | null,
	): Promise<WorkflowModel>;

	public abstract getActiveWorkflowApplications(
		executionContext: FExecutionContext,
		opts: { exclude: ReadonlyArray<WorkflowModel['workflowUuid']> },
	): Promise<Array<WorkflowModel>>;
}

class WorkflowDataPersistentFacadePostgres extends WorkflowDatabase {
	private readonly _sqlConnection: FSqlConnection;

	public constructor(sqlConnection: FSqlConnection) {
		super();

		if (!(sqlConnection.factory instanceof FSqlConnectionFactoryPostgres)) {
			throw new FExceptionInvalidOperation(
				`Unsupported SQL connection type '${sqlConnection.factory.constructor.name}' for '${WorkflowDataPersistentFacadePostgres.name}'`,
			);
		}

		this._sqlConnection = sqlConnection;
	}

	public async findWorkflowById(
		executionContext: FExecutionContext,
		workflowUuid: WorkflowModel['workflowUuid'],
	): Promise<WorkflowModel | null> {
		const sqlRow: FSqlResultRecord | null = await this._sqlConnection
			.statement(
				'SELECT W."id" AS "workflow_id", T."id" AS "tick_id", W."workflow_uuid", W."activity_uuid", W."activity_version", W."utc_created_at", T."workflow_virtual_machine_snapshot", T."workflow_status", T."latest_breakpoint", T."crash_report", T."utc_executed_at", T."next_tick_tags"' +
				' FROM "public"."workflow" AS W' +
				' INNER JOIN "public"."vw_last_workflow_tick" AS T ON W."id" = T."workflow_id"' +
				' WHERE W."id" = (SELECT "id" FROM "public"."workflow" WHERE "workflow_uuid" = $1)',
			)
			.executeSingleOrNull(executionContext, workflowUuid);

		return sqlRow !== null ? WorkflowDataPersistentFacadePostgres.mapWorkflowApplication(sqlRow) : null;
	}

	public async getWorkflowById(
		executionContext: FExecutionContext,
		workflowUuid: WorkflowModel['workflowUuid'],
	): Promise<WorkflowModel> {
		const sqlRow: FSqlResultRecord = await this._sqlConnection
			.statement(
				'SELECT W."id" AS "workflow_id", T."id" AS "tick_id", W."workflow_uuid", W."activity_uuid", W."activity_version", W."utc_created_at", T."workflow_virtual_machine_snapshot", T."workflow_status", T."latest_breakpoint", T."crash_report", T."utc_executed_at", T."next_tick_tags"' +
				' FROM "public"."workflow" AS W' +
				' INNER JOIN "public"."vw_last_workflow_tick" AS T ON W."id" = T."workflow_id"' +
				' WHERE W."id" = (SELECT "id" FROM "public"."workflow" WHERE "workflow_uuid" = $1)',
			)
			.executeSingle(executionContext, workflowUuid);

		return WorkflowDataPersistentFacadePostgres.mapWorkflowApplication(sqlRow);
	}

	public async persistWorkflow(
		executionContext: FExecutionContext,
		workflow: WorkflowModel.Data & WorkflowModel.Tick,
		prevTickId: WorkflowModel['tickId'] | null,
	): Promise<WorkflowModel> {
		let workflowId: string;
		let createdAt: Date;

		const existentWorkflowRecord: FSqlResultRecord | null = await this._sqlConnection
			.statement('SELECT "id", "utc_created_at" FROM "public"."workflow" WHERE "workflow_uuid" = $1')
			.executeSingleOrNull(executionContext, workflow.workflowUuid);

		if (existentWorkflowRecord !== null) {
			workflowId = existentWorkflowRecord.get('id').asString;
			createdAt = existentWorkflowRecord.get('utc_created_at').asDate;
		} else {
			// New workflow
			const workflowRow: FSqlResultRecord = await this._sqlConnection
				.statement(
					'INSERT INTO "public"."workflow"("workflow_uuid", "activity_uuid", "activity_version")' +
					' VALUES ($1, $2, $3) ' +
					' RETURNING "id", "utc_created_at"',
				)
				.executeSingle(
					executionContext,
          /* 1 */ workflow.workflowUuid,
          /* 2 */ workflow.activityUuid,
          /* 3 */ workflow.activityVersion,
				);
			workflowId = workflowRow.get('id').asString;
			createdAt = workflowRow.get('utc_created_at').asDate;
		}

		const tickIdData: FSqlData = await this._sqlConnection
			.statement(
				'INSERT INTO "public"."workflow_tick"("prev_tick_id", "workflow_id", "workflow_virtual_machine_snapshot", "workflow_status", "latest_breakpoint", "crash_report" , "utc_executed_at", "next_tick_tags")' +
				' VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::DOUBLE PRECISION / 1000)::TIMESTAMP WITHOUT TIME ZONE, $8)' +
				' RETURNING "id"',
			)
			.executeScalar(
				executionContext,
        /* 1 */ prevTickId,
        /* 2 */ workflowId,
        /* 3 */ { vmData: workflow.workflowVirtualMachineSnapshot } as any,
        /* 4 */ workflow.workflowStatus,
        /* 5 */ workflow.latestExecutedBreakpoint,
        /* 6 */ workflow.workflowStatus === WorkflowModel.Status.CRASHED ? workflow.crashReport : null,
        /* 7 */ workflow.executedAt.getTime(),
        /* 8 */ workflow.nextTickTags !== null ? workflow.nextTickTags.join(',') : null,
			);
		const tickId: string = tickIdData.asString;
		return Object.freeze({ workflowId, tickId, createdAt, ...workflow });
	}

	public async getActiveWorkflowApplications(
		executionContext: FExecutionContext,
		opts: { exclude: ReadonlyArray<WorkflowModel['workflowUuid']> },
	): Promise<Array<WorkflowModel>> {
		const sqlRows: ReadonlyArray<FSqlResultRecord> = await this._sqlConnection
			.statement(
				'SELECT W."id" AS "workflow_id", T."id" AS "tick_id", W."workflow_uuid", W."activity_uuid", W."activity_version", W."utc_created_at", T."workflow_virtual_machine_snapshot", T."workflow_status", T."latest_breakpoint", T."crash_report", T."utc_executed_at", T."next_tick_tags"' +
				' FROM "public"."workflow" AS W ' +
				' INNER JOIN "public"."vw_last_workflow_tick" AS T ON T."workflow_id" = W."id" ' +
				` WHERE T."workflow_virtual_machine_snapshot" IS NOT NULL AND T."workflow_status" IN ('WORKING','SLEEPING') AND NOT (W."workflow_uuid"::text = ANY ($1))`,
			)
			.executeQuery(executionContext, opts.exclude);

		return sqlRows.map(WorkflowDataPersistentFacadePostgres.mapWorkflowApplication);
	}

	private static mapWorkflowApplication(sqlRow: FSqlResultRecord): WorkflowModel {
		const nextTickTagsData = sqlRow.get('next_tick_tags').asStringNullable;

		const workflowId: string = sqlRow.get('workflow_id').asString;
		const tickId: string = sqlRow.get('tick_id').asString;
		const workflowUuid: string = sqlRow.get('workflow_uuid').asString;
		const activityUuid: string = sqlRow.get('activity_uuid').asString;
		const activityVersion: string = sqlRow.get('activity_version').asString;
		const createdAt: Date = sqlRow.get('utc_created_at').asDate;
		const workflowVirtualMachineSnapshot: any = sqlRow.get('workflow_virtual_machine_snapshot').asObjectNullable
			?.vmData;
		const workflowStatus: WorkflowModel.Status = WorkflowModel.Status.parse(sqlRow.get('workflow_status').asString);
		const latestExecutedBreakpoint: string | null = sqlRow.get('latest_breakpoint').asStringNullable;
		const executedAt: Date = sqlRow.get('utc_executed_at').asDate;
		const nextTickTags: Array<string> | null = nextTickTagsData !== null ? nextTickTagsData.split(',') : null;

		if (workflowStatus === WorkflowModel.Status.CRASHED) {
			const crashReport: string | null = sqlRow.get('crash_report').asStringNullable;
			return Object.freeze({
				workflowId,
				tickId,
				workflowUuid,
				activityUuid,
				activityVersion,
				createdAt,
				workflowVirtualMachineSnapshot,
				workflowStatus,
				latestExecutedBreakpoint,
				executedAt,
				nextTickTags,
				crashReport: crashReport !== null ? crashReport : 'Unknown crash',
			});
		}
		return Object.freeze({
			workflowId,
			tickId,
			workflowUuid,
			activityUuid,
			activityVersion,
			createdAt,
			workflowVirtualMachineSnapshot,
			workflowStatus,
			latestExecutedBreakpoint,
			executedAt,
			nextTickTags,
		});
	}
}
