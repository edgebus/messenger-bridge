import { FExecutionContext } from '@freemework/common';
import * as crypto from 'crypto';

import { WorkflowVirtualMachineExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { BusinessActivity } from './BusinessActivity.js';

@Activity.Id('537f0a1c-4227-47bc-8ecc-b1da87a70e62')
export class RandomUintActivity extends BusinessActivity {
  private readonly _targetVariable: string;

  public constructor(targetVariable: string) {
    super();
    this._targetVariable = targetVariable;
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineExecutionContext.of(executionContext);

    const u8 = crypto.randomBytes(4);
    const u32bytes = u8.buffer.slice(0, 4); // last four bytes as a new `ArrayBuffer`
    const uint = new Uint32Array(u32bytes)[0]!;

    vmContext.variables.set(this._targetVariable, uint);
  }
}

export namespace RandomUintActivity {
  export interface Opts {
    readonly targetVariable: string;
  }
}
