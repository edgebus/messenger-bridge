import { FExecutionContext } from '@freemework/common';
import crypto from 'crypto';

import { WorkflowVirtualMachineExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { BusinessActivity } from './BusinessActivity.js';

@Activity.Id('9201a319-eea7-4163-85ef-24667b53cb98')
export class RandomIntActivity extends BusinessActivity {
  private readonly _targetVariable: string;

  public constructor(opts: RandomIntActivity.Opts) {
    super();
    this._targetVariable = opts.targetVariable;
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineExecutionContext.of(executionContext);

    const u8 = crypto.randomBytes(4);
    const u32bytes = u8.buffer.slice(0, 4); // last four bytes as a new `ArrayBuffer`
    const int = new Int32Array(u32bytes)[0]!;

    vmContext.variables.set(this._targetVariable, int);
  }
}

export namespace RandomIntActivity {
  export interface Opts {
    readonly targetVariable: string;
  }
}
