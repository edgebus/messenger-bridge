import { FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { NativeBreakpointActivity } from './BreakpointActivity.js';

@Activity.Id('0f8591d1-3d07-45c2-8dae-e8a2009e5d30')
export class DelayActivity extends NativeBreakpointActivity {
  private readonly _durationMilliseconds: number;

  public constructor(opts: DelayActivity.Opts) {
    super();
    this._durationMilliseconds = opts.durationMilliseconds;
  }

  protected async onExecuteBreakpoint(executionContext: FExecutionContext): Promise<boolean> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);
    if (!vmContext.variables.hasLocal('wakeupTimestamp')) {
      vmContext.variables.defineLocal('wakeupTimestamp', Date.now() + this._durationMilliseconds);
    } else {
      const wakeupTimestamp: number = vmContext.variables.getInteger('wakeupTimestamp');
      if (wakeupTimestamp < Date.now()) {
        return true;
      }
    }

    NativeBreakpointActivity.of(vmContext).setIdle();

    return false;
  }
}
export namespace DelayActivity {
  export interface Opts {
    readonly durationMilliseconds: number;
  }
}
