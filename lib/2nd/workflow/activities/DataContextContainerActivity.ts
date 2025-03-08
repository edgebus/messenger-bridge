import { FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { DataContextActivity, DataContextFactory } from './DataContextActivity.js';

@Activity.Id('0c9b672e-7efe-4d61-b5da-cda0fdd00863')
export class DataContextContainerActivity<TDataContext> extends DataContextActivity<TDataContext> {
  public constructor(dataContextFactory: DataContextFactory<TDataContext>, child: Activity) {
    super(dataContextFactory, child);
  }

  public get child(): Activity {
    return this.children[0] as Activity;
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    if (vmContext.callCounter === 1) {
      // First call
      await vmContext.stackPush(executionContext, 0);
    } else {
      vmContext.stackPop(); // remove itself
    }
  }
}
