import { FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

/**
 * Just a container for single child activity.
 */
@Activity.Id('ae89471d-0475-40ef-922c-daa0695f8103')
export class ContainerActivity extends NativeActivity {
  public constructor(child: Activity) {
    super(child);
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
