import { FExecutionContext, FInitableBase } from '@freemework/common';

import { Database } from './database.js';

export abstract class DatabaseFactory extends FInitableBase {
	public abstract create(
		executionContext: FExecutionContext
	): Promise<Database>;

	public abstract using<TResult>(
		executionContext: FExecutionContext,
		workload: (executionContext: FExecutionContext, db: Database) => Promise<TResult>,
	): Promise<TResult>;

	public abstract waitForServer(
		executionContext: FExecutionContext,
		maxTimeoutMs: number,
	): Promise<void>;
}
