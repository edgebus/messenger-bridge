import { FExceptionInvalidOperation, FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachine, WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity, ActivityElement } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

@Activity.Id('c41a3d31-ba3d-4b41-acb5-26b7dd63547f')
export class LoopActivity extends NativeActivity {
  public static of(vmContext: WorkflowVirtualMachine.Context): LoopActivityElement {
    for (const frame of vmContext.stack) {
      if (LoopActivityInternal.isLoopActivityStackFrame(frame)) {
        return new LoopActivityElement(frame);
      }
    }
    throw new FExceptionInvalidOperation(`Activity '${LoopActivity.name}' was not found in current stack.`);
  }

  public constructor(child: NativeActivity) {
    super(child);
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    if (LoopActivity.of(vmContext).isBreakRequired) {
      vmContext.stackPop(); // remove itself
    } else {
      await vmContext.stackPush(executionContext, 0); // loop while isBreakRequired variable is false (see LoopActivityElement#break)
    }
  }
}
export class LoopActivityElement extends ActivityElement<LoopActivity> {
  public constructor(stackFrame: WorkflowVirtualMachine.StackFrame<LoopActivity>) {
    super(stackFrame);
    if (!stackFrame.currentContext.variables.has(LoopActivityInternal.breakFlagKey)) {
      stackFrame.currentContext.variables.defineLocal(LoopActivityInternal.breakFlagKey, false);
    }
  }

  public get isBreakRequired(): boolean {
    return this.vmContext.variables.getBoolean(LoopActivityInternal.breakFlagKey);
  }

  public break(): void {
    this.vmContext.variables.set(LoopActivityInternal.breakFlagKey, true);
  }
}
namespace LoopActivityInternal {
  export const breakFlagKey = 'breakFlag';

  export function isLoopActivityStackFrame<
    T extends WorkflowVirtualMachine.StackFrame<LoopActivity>,
    U extends WorkflowVirtualMachine.StackFrame<Activity>,
  >(frame: T | U): frame is T {
    return frame.activity instanceof LoopActivity;
  }
}
