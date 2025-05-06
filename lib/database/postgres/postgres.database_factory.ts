import {
	FException,
	FExceptionAggregate,
	FExceptionInvalidOperation,
	FExecutionContext,
	// FInitable,
	// FInitableMixin,
	FLogger,
	FSleep,
} from "@freemework/common";
import { FSqlConnectionFactoryPostgres } from "@freemework/sql.postgres";

import { appInfo } from "../../app-info.js";

import { Bind } from "../../utils/bind.js";
import { MaskService } from "../../utils/mask_service.js";

import { Database } from "../database.js";
import { DatabaseFactory } from "../database_factory.js";

import { PostgresDatabase } from "./postgres.database.js";

export class PostgresDatabaseFactory extends DatabaseFactory {
	public constructor(sqlConnectionUrlOrFactory: URL | FSqlConnectionFactoryPostgres) {
		super();

		this._logger = FLogger.create(PostgresDatabaseFactory.name);

		if (sqlConnectionUrlOrFactory instanceof FSqlConnectionFactoryPostgres) {
			this._sqlConnectionUrl = null;
			this._sqlConnectionFactory = sqlConnectionUrlOrFactory;
		} else {
			this._sqlConnectionUrl = sqlConnectionUrlOrFactory;
			this._sqlConnectionFactory = new FSqlConnectionFactoryPostgres({
				url: sqlConnectionUrlOrFactory,
				log: FLogger.create(PostgresDatabase.name),
				applicationName: `${appInfo.title} v${appInfo.version}`
			});
		}
	}

	@Bind
	public async create(executionContext: FExecutionContext): Promise<Database> {
		super.verifyInitializedAndNotDisposed();

		const db: PostgresDatabase = new PostgresDatabase(this._sqlConnectionFactory);
		await db.init(executionContext);
		return db;
	}

	public async waitForServer(
		executionContext: FExecutionContext,
		maxTimeoutMs: number,
	): Promise<void> {
		super.verifyInitializedAndNotDisposed();

		let count = 0;
		let numberDelays = 10;
		let currentDelay = maxTimeoutMs / numberDelays / numberDelays;
		while (true) {
			try {
				const db = await this.create(executionContext);
				await db.dispose();
				return;
			} catch (e) {
				const isConnectionRefused: boolean = ("code" in (e as any) && (e as any).code === "ECONNREFUSED" && (e as any).syscall === "connect")
				count++
				if (!isConnectionRefused || count === numberDelays) {
					const ex: FException = FException.wrapIfNeeded(e);
					this._logger.warn(executionContext, `Can not connect to postgres database during ${numberDelays} attempts:  ${ex}`)
					throw ex;
				} else {
					await FSleep(executionContext, currentDelay);
					this._logger.info(executionContext, `Attempting to reestablish a ${count} / ${numberDelays - 1} connection to the DB with a delay ${currentDelay.toFixed(0)} ms`);
					currentDelay = currentDelay * 1.6;
				}
			}
		}
	}

	@Bind
	public async using<TResult>(
		executionContext: FExecutionContext,
		worker: (dbExecutionContext: FExecutionContext, db: Database) => Promise<TResult>,
	): Promise<TResult> {
		super.verifyInitializedAndNotDisposed();

		await using db: Database = await this.create(executionContext);
		try {
			const workerResult = await worker(executionContext, db);
			await db.transactionCommit(executionContext);
			return workerResult;
		} catch (e) {
			try { await db.transactionRollback(executionContext); }
			catch (rollbackEx) {
				throw new FExceptionAggregate([
					FException.wrapIfNeeded(e),
					FException.wrapIfNeeded(rollbackEx)
				]);
			}
			throw e;
		}
	}

	protected async onInit(): Promise<void> {
		if (this._sqlConnectionUrl === null) {
			// Nothing to do due we use external sqlConnectionFactory
			return;
		}

		const executionContext: FExecutionContext = this.initExecutionContext;

		const maskedConnectionString: string = MaskService.default.maskUri(this._sqlConnectionUrl).toString();
		this._logger.info(executionContext, () => `Initializing Postgres connection ${maskedConnectionString}`);
		try {
			await this._sqlConnectionFactory.init(executionContext);
		} catch (e) {
			const err: FException = FException.wrapIfNeeded(e);
			this._logger.error(executionContext, () => `Failure initialize Postgres connection ${maskedConnectionString}. Inner message: ${err.message}`);
			throw err; // re-throw
		}
	}

	protected async onDispose(): Promise<void> {
		if (this._sqlConnectionUrl === null) {
			// Nothing to do due we use external sqlConnectionFactory
			return;
		}

		await this._sqlConnectionFactory.dispose();
	}

	private readonly _sqlConnectionFactory: FSqlConnectionFactoryPostgres;
	private readonly _logger: FLogger;
	private readonly _sqlConnectionUrl: URL | null;
}
