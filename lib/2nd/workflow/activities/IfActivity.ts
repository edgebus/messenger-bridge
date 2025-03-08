import { FExceptionInvalidOperation, FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachine, WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity, ActivityElement } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

@Activity.Id('58dc3233-bd64-4388-8384-c3585e8df05c')
export class IfActivity extends NativeActivity {
  public static of(vmContext: WorkflowVirtualMachine.Context): IfActivityElement {
    for (const frame of vmContext.stack) {
      if (IfActivityInternal.isIfActivityStackFrame(frame)) {
        return new IfActivityElement(frame);
      }
    }
    throw new FExceptionInvalidOperation(`Activity '${IfActivity.name}' was not found in current stack.`);
  }

  public constructor(opts: {
    readonly conditionActivity: Activity;
    readonly trueActivity: Activity;
    readonly falseActivity?: Activity;
  }) {
    const children = [opts.conditionActivity, opts.trueActivity];
    if (opts.falseActivity !== undefined) {
      children.push(opts.falseActivity);
    }
    super(...children);
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    if (vmContext.callCounter === 1) {
      // First call. Push condition activity to the stack.
      await vmContext.stackPush(executionContext, 0);
    } else if (vmContext.callCounter === 2) {
      // Second call

      const { conditionResult } = IfActivity.of(vmContext);
      if (conditionResult) {
        // Push trueActivity to the stack.
        await vmContext.stackPush(executionContext, 1);
      } else if (this.children.length > 2) {
        // Push falseActivity to the stack.
        await vmContext.stackPush(executionContext, 2);
      }
    } else {
      // Third call
      vmContext.stackPop(); // remove itself
    }
  }
}
export class IfActivityElement extends ActivityElement<IfActivity> {
  public constructor(stackFrame: WorkflowVirtualMachine.StackFrame<IfActivity>) {
    super(stackFrame);
    const { variables } = stackFrame.currentContext;
    if (!variables.hasLocal(IfActivityInternal.conditionResultKey)) {
      stackFrame.currentContext.variables.defineLocal(IfActivityInternal.conditionResultKey, false);
    }
  }

  public get conditionResult(): boolean {
    return this.vmContext.variables.getBoolean(IfActivityInternal.conditionResultKey);
  }

  public markTrue(): void {
    this.vmContext.variables.set(IfActivityInternal.conditionResultKey, true);
  }

  public markFalse(): void {
    this.vmContext.variables.set(IfActivityInternal.conditionResultKey, false);
  }
}
namespace IfActivityInternal {
  export const conditionResultKey = 'conditionResult';

  export function isIfActivityStackFrame<
    T extends WorkflowVirtualMachine.StackFrame<IfActivity>,
    U extends WorkflowVirtualMachine.StackFrame<Activity>,
  >(frame: T | U): frame is T {
    return frame.activity instanceof IfActivity;
  }
}
