import { FExecutionContext } from '@freemework/common';

import { Activity } from './Activity.js';
import { BusinessActivity } from './BusinessActivity.js';

@Activity.Id('cc2cdbf0-6544-414d-b271-ca39d808553d')
export class CodeActivity extends BusinessActivity {
  private readonly _callback: CodeActivity.Opts['callback'];

  public constructor(opts: CodeActivity.Opts) {
    super();
    this._callback = opts.callback;
  }

  protected async onExecute(executionContext: FExecutionContext) {
    await this._callback.call(null, executionContext);
  }
}

export namespace CodeActivity {
  export interface Opts {
    readonly callback: (executionContext: FExecutionContext) => void | Promise<void>;
  }
}
