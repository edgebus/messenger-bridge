import { FExecutionContext } from '@freemework/common';

import { Activity } from './Activity.js';

export abstract class BusinessActivity extends Activity {
  public async execute(executionContext: FExecutionContext): Promise<void> {
    await this.onExecute(executionContext);
  }

  protected abstract onExecute(executionContext: FExecutionContext): void | Promise<void>;
}
