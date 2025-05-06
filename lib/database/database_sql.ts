import {
	FCancellationExecutionContext,
	FCancellationToken,
	FDisposableBase,
	FException,
	FExceptionAggregate,
	FExceptionInvalidOperation,
	FExecutionContext,
	FInitableBase,
	FLogger,
	FSqlConnection,
	FSqlConnectionFactory
} from "@freemework/common";

import { Database } from "./database.js";
import { FSqlConnectionFactoryPostgres } from "@freemework/sql.postgres";

export abstract class DatabaseSql2 extends Database {
	private readonly _sqlConnectionManagement: {
		readonly sqlConnectionFactory: FSqlConnectionFactory;
		transactionIO: Promise<void>;
		sqlConnection: FSqlConnection | null;
	} | null;
	private readonly _foreignSqlConnection: FSqlConnection | null;
	private readonly _logger: FLogger;

	public constructor(sqlConnectionOrFactory: FSqlConnection | FSqlConnectionFactoryPostgres) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		this._foreignSqlConnection = sqlConnectionOrFactory instanceof FSqlConnectionFactoryPostgres
			? null
			: sqlConnectionOrFactory;
		this._sqlConnectionManagement = sqlConnectionOrFactory instanceof FSqlConnectionFactoryPostgres
			? {
				sqlConnectionFactory: sqlConnectionOrFactory,
				transactionIO: Promise.resolve(),
				sqlConnection: null,
			}
			: null;
	}

	public transactionCommit(executionContext: FExecutionContext): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) {
			throw new FExceptionInvalidOperation("Unable to use method without SQL management. Use FSqlConnectionFactory to instantiate object to use this method.");
		}

		sqlConnectionManagement.transactionIO = sqlConnectionManagement.transactionIO.then(async () => {
			await DatabaseSql2._commit(executionContext, this.sqlConnection);
			await this.sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
		});

		return sqlConnectionManagement.transactionIO;
	}

	public async transactionRollback(executionContext: FExecutionContext): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) {
			throw new FExceptionInvalidOperation("Unable to use method without SQL management. Use FSqlConnectionFactory to instantiate object to use this method.");
		}

		sqlConnectionManagement.transactionIO = sqlConnectionManagement.transactionIO.then(async () => {
			const sqlConnection: FSqlConnection | null = sqlConnectionManagement.sqlConnection;
			if (sqlConnection !== null) {
				await DatabaseSql2._rollback(executionContext, sqlConnection);
				await sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
			}
		});

		return sqlConnectionManagement.transactionIO;
	}

	protected get logger(): FLogger { return this._logger; }

	protected get sqlConnection(): FSqlConnection {
		this.verifyInitializedAndNotDisposed();
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement !== null) {
			return sqlConnectionManagement.sqlConnection!;
		} else {
			return this._foreignSqlConnection!;
		}
	}

	protected async onInit(): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) { return; }

		const sqlConnection: FSqlConnection = await sqlConnectionManagement
			.sqlConnectionFactory.create(this.initExecutionContext);
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
		sqlConnectionManagement.sqlConnection = sqlConnection;
	}

	protected async onDispose(): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) { return; }

		const sqlConnection: FSqlConnection = sqlConnectionManagement.sqlConnection!;
		sqlConnectionManagement.sqlConnection = null;

		try {
			await DatabaseSql2._rollback(this.initExecutionContext, sqlConnection!);
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
}


export abstract class DatabaseSql extends Database {
	public readonly sqlContinuouslyTransaction: SqlContinuouslyTransaction;
	private readonly _logger: FLogger;

	public constructor(sqlConnectionOrFactory: FSqlConnection | FSqlConnectionFactoryPostgres) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		this.sqlContinuouslyTransaction = new SqlContinuouslyTransaction(sqlConnectionOrFactory);
	}

	protected get logger(): FLogger { return this._logger; }

	public transactionCommit(executionContext: FExecutionContext): Promise<void> {
		return this.sqlContinuouslyTransaction.transactionCommit(executionContext);
	}

	public transactionRollback(executionContext: FExecutionContext): Promise<void> {
		return this.sqlContinuouslyTransaction.transactionRollback(executionContext);
	}

	protected async onInit(): Promise<void> {
		await this.sqlContinuouslyTransaction.init(this.initExecutionContext);
	}

	protected async onDispose(): Promise<void> {
		await this.sqlContinuouslyTransaction.dispose();
	}
}

export class SqlContinuouslyTransaction extends FInitableBase {
	private readonly _sqlConnectionManagement: {
		readonly sqlConnectionFactory: FSqlConnectionFactory;
		transactionIO: Promise<void>;
		sqlConnection: FSqlConnection | null;
	} | null;
	private readonly _foreignSqlConnection: FSqlConnection | null;
	private readonly _logger: FLogger;

	public constructor(sqlConnectionOrFactory: FSqlConnection | FSqlConnectionFactoryPostgres) {
		super();
		this._logger = FLogger.create(this.constructor.name);
		this._foreignSqlConnection = sqlConnectionOrFactory instanceof FSqlConnectionFactoryPostgres
			? null
			: sqlConnectionOrFactory;
		this._sqlConnectionManagement = sqlConnectionOrFactory instanceof FSqlConnectionFactoryPostgres
			? {
				sqlConnectionFactory: sqlConnectionOrFactory,
				transactionIO: Promise.resolve(),
				sqlConnection: null,
			}
			: null;
	}

	public transactionCommit(executionContext: FExecutionContext): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) {
			throw new FExceptionInvalidOperation("Unable to use method without SQL management. Use FSqlConnectionFactory to instantiate object to use this method.");
		}

		sqlConnectionManagement.transactionIO = sqlConnectionManagement.transactionIO.then(async () => {
			await SqlContinuouslyTransaction._commit(executionContext, this.sqlConnection);
			await this.sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
		});

		return sqlConnectionManagement.transactionIO;
	}

	public async transactionRollback(executionContext: FExecutionContext): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) {
			throw new FExceptionInvalidOperation("Unable to use method without SQL management. Use FSqlConnectionFactory to instantiate object to use this method.");
		}

		sqlConnectionManagement.transactionIO = sqlConnectionManagement.transactionIO.then(async () => {
			const sqlConnection: FSqlConnection | null = sqlConnectionManagement.sqlConnection;
			if (sqlConnection !== null) {
				await SqlContinuouslyTransaction._rollback(executionContext, sqlConnection);
				await sqlConnection.statement("BEGIN TRANSACTION").execute(executionContext);
			}
		});

		return sqlConnectionManagement.transactionIO;
	}

	protected get logger(): FLogger { return this._logger; }

	public get sqlConnection(): FSqlConnection {
		this.verifyInitializedAndNotDisposed();
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement !== null) {
			return sqlConnectionManagement.sqlConnection!;
		} else {
			return this._foreignSqlConnection!;
		}
	}

	protected async onInit(): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) { return; }

		const sqlConnection: FSqlConnection = await sqlConnectionManagement
			.sqlConnectionFactory.create(this.initExecutionContext);
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
		sqlConnectionManagement.sqlConnection = sqlConnection;
	}

	protected async onDispose(): Promise<void> {
		const sqlConnectionManagement = this._sqlConnectionManagement;
		if (sqlConnectionManagement === null) { return; }

		const sqlConnection: FSqlConnection = sqlConnectionManagement.sqlConnection!;
		sqlConnectionManagement.sqlConnection = null;

		try {
			await SqlContinuouslyTransaction._rollback(this.initExecutionContext, sqlConnection!);
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
}
