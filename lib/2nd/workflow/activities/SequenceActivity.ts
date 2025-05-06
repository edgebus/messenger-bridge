import { FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

@Activity.Id('d2360cf2-d55f-4198-ba84-a8af34c9888f')
export class SequenceActivity extends NativeActivity {
  public constructor(...children: ReadonlyArray<Activity>) {
    super(...children);
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    const childIndex: number = vmContext.callCounter - 1;
    if (childIndex < this.children.length) {
      await vmContext.stackPush(executionContext, childIndex);
    } else {
      vmContext.stackPop(); // remove itself
    }
  }
}
