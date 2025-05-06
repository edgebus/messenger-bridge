import { FExecutionContext, FExecutionContextBase, FExecutionElement } from '@freemework/common';

import { Activity, NamedBreakpointActivity } from './activities/index.js';

export interface WorkflowVirtualMachine extends WorkflowVirtualMachine.Context {
  /**
   * Gets current executing activity, or raise FExceptionInvalidOperation if isTerminated === true
   */
  readonly currentActivity: Activity;

  /**
   * Get entry point activity
   */
  readonly entryPointActivity: Activity;

  /**
   * true - when idle
   * false - when tick is executing right now
   */
  readonly isPaused: boolean;

  /**
   * true - when no activities left to execute
   */
  readonly isTerminated: boolean;

  /**
   * Gets latest execute breakpoint activity (if executed)
   */
  readonly latestExecutedBreakpoint: NamedBreakpointActivity | null;

  /**
   * Gets callstack of activities
   */
  readonly stack: ReadonlyArray<WorkflowVirtualMachine.StackFrame>;

  readonly flags: WorkflowVirtualMachine.Flags;

  /**
   * Get persistable variables storage.
   */
  readonly variables: WorkflowVirtualMachine.Variables;

  /**
   * Get map of the breakpoints of the executed workflow
   */
  readonly breakpoints: ReadonlyMap<NamedBreakpointActivity['name'], NamedBreakpointActivity>;

  /**
   * Gets OID of current activity
   */
  readonly oid: string;

  stackPush(executionContext: FExecutionContext, index: number): Promise<void>;
  stackPop(): void;

  /**
   * Execute next workflow item
   * @returns Idle status. `true` is nothing to do (check isPaused/isTerminated flags)
   */
  tick(executionContext: FExecutionContext): Promise<boolean>;

  toJSON(): any;
}
export namespace WorkflowVirtualMachine {
  export const enum Scope {
    /**
     * Accessible for all inner activities
     */
    INHERIT = 'INHERIT',
    /**
     * Accessible for current activity only
     */
    LOCAL = 'LOCAL',
  }

  export interface StackFrame<TActivity extends Activity = Activity> {
    /**
     * Gets reference to an Activity related to the current stack frame
     */
    readonly activity: TActivity;

    /**
     * Gets an instance of ExecutionContext related to the current stack frame
     */
    readonly currentContext: WorkflowVirtualMachine.Context;
  }

  export interface Context {
    /**
     * Gets number of calls of current activity (started from 1)
     */
    readonly callCounter: number;
    /**
     * Gets OID of current activity
     */
    readonly oid: string;
    /**
     * Gets activities call stack
     */
    readonly stack: ReadonlyArray<StackFrame>;
    /**
     * Persistable variables
     */
    readonly variables: WorkflowVirtualMachine.Variables;
    /**
     * Non-persistable workflow application flags (shared across all activities in the workflow application)
     */
    readonly flags: WorkflowVirtualMachine.Flags;
    /**
     * Gets latest execute breakpoint activity (if executed)
     */
    readonly latestExecutedBreakpoint: NamedBreakpointActivity | null;
  }
  export interface NativeContext extends Context {
    setupExceptionHandler(): void;
    getExceptionData(): { readonly message: string; readonly stack: ReadonlyArray<Activity> } | null;
    hasExceptionHandler(): boolean;
    stackPush(executionContext: FExecutionContext, child: number): Promise<void>;
    stackPop(): void;
  }

  export type Value = boolean | number | string | null;
  export interface Variables {
    defineGlobal(name: string, value: Value): void;
    defineInherit(name: string, value: Value): void;
    defineLocal(name: string, value: Value): void;
    getBoolean(name: string): boolean;
    getNullableBoolean(name: string): boolean | null;
    getInteger(name: string): number;
    getNullableInteger(name: string): number | null;
    getNumber(name: string): number;
    getNullableNumber(name: string): number | null;
    getString(name: string): string;
    getNullableString(name: string): string | null;
    has(name: string): boolean;
    hasGlobal(name: string): boolean;
    hasLocal(name: string): boolean;
    set(name: string, value: Value): void;
  }
  export interface Flags {
    has(name: string): boolean;
    reset(name: string): void;
    set(name: string): void;
  }
}

export class WorkflowVirtualMachineExecutionContext extends FExecutionContextBase {
  public static of(executionContext: FExecutionContext): WorkflowVirtualMachineExecutionElement {
    const wvmExecutionContext: WorkflowVirtualMachineExecutionContext = FExecutionContext.getExecutionContext(
      executionContext,
      WorkflowVirtualMachineExecutionContext,
    );

    return new WorkflowVirtualMachineExecutionElement(wvmExecutionContext);
  }

  private readonly _vmContext: WorkflowVirtualMachine.Context;

  public constructor(prevContext: FExecutionContext, wrap: WorkflowVirtualMachine.Context) {
    super(prevContext);
    this._vmContext = wrap;
  }

  public get vmContext(): WorkflowVirtualMachine.Context {
    return this._vmContext;
  }
}
export class WorkflowVirtualMachineExecutionElement<
  TExecutionContext extends WorkflowVirtualMachineExecutionContext = WorkflowVirtualMachineExecutionContext,
> extends FExecutionElement<TExecutionContext> {
  public get vmContext(): WorkflowVirtualMachine.Context {
    return this.owner.vmContext;
  }
}

export class WorkflowVirtualMachineNativeExecutionContext extends FExecutionContextBase {
  public static of(executionContext: FExecutionContext): WorkflowVirtualMachineNativeExecutionElement {
    const wvmNativeExecutionContext: WorkflowVirtualMachineNativeExecutionContext =
      FExecutionContext.getExecutionContext(executionContext, WorkflowVirtualMachineNativeExecutionContext);

    return new WorkflowVirtualMachineNativeExecutionElement(wvmNativeExecutionContext);
  }

  private readonly _vmContext: WorkflowVirtualMachine.NativeContext;

  public constructor(prevContext: FExecutionContext, wrap: WorkflowVirtualMachine.NativeContext) {
    super(new WorkflowVirtualMachineExecutionContext(prevContext, wrap));
    this._vmContext = wrap;
  }

  public get vmContext(): WorkflowVirtualMachine.NativeContext {
    return this._vmContext;
  }
}
export class WorkflowVirtualMachineNativeExecutionElement<
  TExecutionContext extends WorkflowVirtualMachineNativeExecutionContext = WorkflowVirtualMachineNativeExecutionContext,
> extends FExecutionElement<TExecutionContext> {
  public get vmContext(): WorkflowVirtualMachine.NativeContext {
    return this.owner.vmContext;
  }
}
