import { FExecutionContext } from '@freemework/common';

import { Activity } from './Activity.js';
import { BusinessActivity } from './BusinessActivity.js';

@Activity.Id('cf31d7c4-ca74-4625-a6e3-7346e2070e3c')
export class ConsoleLogActivity extends BusinessActivity {
  private readonly _text: string;

  public constructor(opts: ConsoleLogActivity.Opts) {
    super();
    this._text = opts.text;
  }

  protected onExecute(_executionContext: FExecutionContext) {
    // const { vmContext } = WorkflowVirtualMachineExecutionContext.of(executionContext);

    console.log(this._text);
  }
}

export namespace ConsoleLogActivity {
  export interface Opts {
    readonly text: string;
  }
}
