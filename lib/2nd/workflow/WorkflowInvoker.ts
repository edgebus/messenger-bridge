import { FExceptionArgument, FExceptionInvalidOperation, FExecutionContext, FSleep } from '@freemework/common';

import { WorkflowVirtualMachine1Impl } from './internal/WorkflowVirtualMachine1Impl.js';
import { NativeActivity } from './activities/index.js';
import { WorkflowVirtualMachine } from './WorkflowVirtualMachine.js';

export class WorkflowInvoker {
  private readonly _wvm: WorkflowVirtualMachine;
  private _state: WorkflowInvoker.State;

  public static async run(
    executionContext: FExecutionContext,
    workflowId: string,
    activity: NativeActivity,
  ): Promise<void> {
    const instance = WorkflowInvoker.create(executionContext, workflowId, activity);
    return instance.invoke(executionContext);
  }

  public get currentExecutionContext(): WorkflowVirtualMachine.Context {
    if (this._state === WorkflowInvoker.State.NEW) {
      return this._wvm;
    }

    if (!this._wvm.isPaused) {
      throw new FExceptionInvalidOperation(
        'Wrong operation at current state. A currentExecutionContext is available in pause-state only.',
      );
    }
    if (this._wvm.isTerminated) {
      throw new FExceptionInvalidOperation('Wrong operation at current state. A WorkflowVirtualMachine is terminated.');
    }

    return this._wvm;
  }

  public async invoke(executionContext: FExecutionContext) {
    while (true) {
      const completed = await this.step(executionContext);
      if (!completed) {
        await FSleep(executionContext, 1000);
      } else {
        break;
      }
    }
  }

  /**
   * Executes virtual machine till pause or completion
   * @param cancellationToken
   */
  public async step(executionContext: FExecutionContext): Promise<boolean> {
    if (![WorkflowInvoker.State.NEW, WorkflowInvoker.State.SLEEPING].includes(this._state)) {
      throw new FExceptionInvalidOperation(`Workflow is in ${this._state} state, unable perform next step.`);
    }

    try {
      this._state = WorkflowInvoker.State.WORKING;
      while (true) {
        const isIdle = await this._wvm.tick(executionContext);
        if (isIdle) {
          if (this._wvm.isPaused) {
            this._state = WorkflowInvoker.State.SLEEPING;
            return false;
          }

          if (this._wvm.isTerminated) {
            this._state = WorkflowInvoker.State.COMPLETED;
            return true;
          }
        }
      }
    } catch (e) {
      this._state = WorkflowInvoker.State.CRASHED;
      // const err: FException = FException.wrapIfNeeded(e);
      // for (const breakpoint of this._wvm.breakpoints.values()) {
      // 	breakpoint.notifyAwaitersForCrash(err, this._wvm);
      // }
      throw e;
    }
  }

  // public waitForBreakpoint(executionContext: FExecutionContext, breakpointName: string): Promise<BreakpointElement> {
  // 	const breakpointActivity = this._wvm.breakpoints.get(breakpointName);
  // 	if (breakpointActivity === undefined) {
  // 		throw new ArgumentError("breakpointName", `A breakpoint '${breakpointName}' was not found`);
  // 	}
  // 	return breakpointActivity.wait(executionContext, this._wvm);
  // }

  public resumeBreakpoint(breakpointName: string): void {
    const breakpointActivity = this._wvm.breakpoints.get(breakpointName);
    if (breakpointActivity === undefined) {
      throw new FExceptionArgument(`A breakpoint '${breakpointName}' was not found`, 'breakpointName');
    }
    const breakpointElement = breakpointActivity.createElement(this._wvm);
    // breakpointActivity.resume(this._wvm);
    breakpointElement.isEnabled = false;
  }

  private constructor(machine: WorkflowVirtualMachine) {
    this._state = WorkflowInvoker.State.NEW;
    this._wvm = machine;
  }

  public static create(
    _executionContext: FExecutionContext,
    _workflowId: string,
    activity: NativeActivity,
  ): WorkflowInvoker {
    const wvm = new WorkflowVirtualMachine1Impl(activity, null);
    return new WorkflowInvoker(wvm);
  }
}

export namespace WorkflowInvoker {
  export const enum State {
    NEW = 'New',
    WORKING = 'Working',
    SLEEPING = 'Sleeping',
    CRASHED = 'Crashed',
    COMPLETED = 'Completed',
  }

  export interface WorkflowInvokerState {
    state: State;
    // machine: WorkflowVirtualMachine.WorkflowVirtualMachineState;
  }
}
