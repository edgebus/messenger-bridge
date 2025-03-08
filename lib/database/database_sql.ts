import {
	FCancellationExecutionContext,
	FCancellationToken,
	FException,
	FExceptionAggregate,
	FExecutionContext,
	FLogger,
	FSqlConnection,
	FSqlConnectionFactory
} from "@freemework/common";

import { Database } from "./database.js";

export abstract class DatabaseSql extends Database {
	public constructor(sqlConnectionFactory: FSqlConnectionFactory) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		this._sqlConnection = null;
		this._sqlConnectionFactory = sqlConnectionFactory;
		this._transactionIO = Promise.resolve();
	}

	public transactionCommit(executionContext: FExecutionContext): Promise<void> {
		this._transactionIO = this._transactionIO.then(async () => {
			await DatabaseSql._commit(executionContext, this.sqlConnection);
			await this.sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
		});

		return this._transactionIO;
	}

	public async transactionRollback(executionContext: FExecutionContext): Promise<void> {
		this._transactionIO = this._transactionIO.then(async () => {
			const sqlConnection: FSqlConnection | null = this._sqlConnection;
			if (sqlConnection !== null) {
				await DatabaseSql._rollback(executionContext, sqlConnection);
				await sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
			}
		});

		return this._transactionIO;
	}

	protected get logger(): FLogger { return this._logger; }

	protected get sqlConnection(): FSqlConnection {
		this.verifyInitializedAndNotDisposed();
		return this._sqlConnection!;
	}

	protected async onInit(): Promise<void> {
		const sqlConnection: FSqlConnection = await this._sqlConnectionFactory.create(this.initExecutionContext);
		try {
			await sqlConnection.statement("BEGIN TRANSACTION").execute(this.initExecutionContext);
		} catch (e) {
			try { await sqlConnection.dispose(); } catch (e2) {
				throw new FExceptionAggregate([
					FException.wrapIfNeeded(e),
					FException.wrapIfNeeded(e2)
				]);
			}
			throw e;
		}
		this._sqlConnection = sqlConnection;
	}

	protected async onDispose(): Promise<void> {
		const sqlConnection: FSqlConnection = this._sqlConnection!;
		this._sqlConnection = null;

		try {
			await DatabaseSql._rollback(this.initExecutionContext, sqlConnection!);
		} catch (e) {
			const ex: FException = FException.wrapIfNeeded(e);
			this.logger.warn(this.initExecutionContext, () => `Failure to rollback SQL transaction. Error: ${ex.message}`);
			this.logger.debug(this.initExecutionContext, "Failure to rollback SQL transaction.", ex);
		}

		await sqlConnection.dispose();
	}

	private static async _commit(executionContext: FExecutionContext, sqlConnection: FSqlConnection): Promise<void> {
		await sqlConnection.statement("COMMIT TRANSACTION").execute(executionContext);
	}

	private static async _rollback(executionContext: FExecutionContext, sqlConnection: FSqlConnection): Promise<void> {
		//
		// We have not to cancel this operation, so pass noncancellableExecutionContext
		//
		const noncancellableExecutionContext: FExecutionContext = new FCancellationExecutionContext(
			executionContext,
			FCancellationToken.Dummy
		);
		await sqlConnection.statement("ROLLBACK TRANSACTION").execute(noncancellableExecutionContext);
	}

	private readonly _sqlConnectionFactory: FSqlConnectionFactory;
	private readonly _logger: FLogger;
	private _sqlConnection: FSqlConnection | null;
	private _transactionIO: Promise<void>;
}
