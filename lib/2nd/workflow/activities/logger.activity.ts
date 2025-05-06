import { FExecutionContext } from "@freemework/common";

import { BusinessActivity } from "./BusinessActivity.js";

export class LoggerActivity extends BusinessActivity {
	public constructor(
		private readonly msg: string
	) { super(); }

	protected onExecute(executionContext: FExecutionContext): void | Promise<void> {
		this._logger.info(executionContext, () => this.msg);
	}
}
