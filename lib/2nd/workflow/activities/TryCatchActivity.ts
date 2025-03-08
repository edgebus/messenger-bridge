import { FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

@Activity.Id('ea7198b4-aebe-4289-a90b-7cff6142503a')
export class TryCatchActivity extends NativeActivity {
  // == TODO ==
  // public static of(
  // 	vmContext: WorkflowVirtualMachine.ExecutionContext
  // ): TryCatchActivityElement {
  // 	for (const frame of vmContext.stack) {
  // 		if (isTryCatchActivityStackFrame(frame)) {
  // 			return new TryCatchActivityElement(frame);
  // 		}
  // 	}
  // 	throw new FExceptionInvalidOperation(`Activity '${TryCatchActivity.name}' was not found in current stack.`);
  // }

  private readonly _exceptionMessageVariable: string;
  private readonly _exceptionStackVariable: string | null;

  public constructor({
    tryActivity,
    catchActivity,
    exceptionMessageVariable,
    exceptionStackVariable,
  }: {
    readonly tryActivity: Activity;
    readonly catchActivity: Activity;
    readonly exceptionMessageVariable: string;
    readonly exceptionStackVariable?: string;
  }) {
    super(tryActivity, catchActivity);
    this._exceptionMessageVariable = exceptionMessageVariable;
    this._exceptionStackVariable = exceptionStackVariable !== undefined ? exceptionStackVariable : null;
  }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    if (!vmContext.hasExceptionHandler()) {
      vmContext.setupExceptionHandler();
      await vmContext.stackPush(executionContext, 0); // tryActivity
    } else if (!vmContext.variables.has(this._exceptionMessageVariable)) {
      const exceptionData = vmContext.getExceptionData();
      if (exceptionData === null) {
        // No exception! Nice!
        vmContext.stackPop(); // remove itself
      } else {
        // First call after exception, so delegate work to catchActivity
        vmContext.variables.defineInherit(this._exceptionMessageVariable, exceptionData.message);
        if (this._exceptionStackVariable !== null) {
          vmContext.variables.defineInherit(this._exceptionStackVariable, JSON.stringify(exceptionData.stack));
        }
        await vmContext.stackPush(executionContext, 1); // catchActivity
      }
    } else {
      // catchActivity already executed, so good buy
      vmContext.stackPop(); // remove itself
    }
  }
}
