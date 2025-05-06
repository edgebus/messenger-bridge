import { FExceptionInvalidOperation, FExecutionContext } from '@freemework/common';

import { WorkflowVirtualMachine, WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

import { Activity, activityRecursiveWalker } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

export abstract class NativeBreakpointActivity extends NativeActivity {
  public static of(vmContext: WorkflowVirtualMachine.Context): NativeBreakpointActivityElement {
    for (const frame of vmContext.stack) {
      if (NativeBreakpointActivityInternal.isNativeBreakpointActivityStackFrame(frame)) {
        const activity: NativeBreakpointActivity = frame.activity;
        const initFrame = vmContext.stack[vmContext.stack.length - 1]!; // last frame is the init frame
        return new NativeBreakpointActivityElement(initFrame.currentContext, activity);
      }
    }
    throw new FExceptionInvalidOperation(`Activity '${NativeBreakpointActivity.name}' was not found in current stack.`);
  }

  private static ofModifable(
    vmContext: WorkflowVirtualMachine.Context,
  ): NativeBreakpointActivityInternal.ModifiableElement {
    for (const frame of vmContext.stack) {
      if (NativeBreakpointActivityInternal.isNativeBreakpointActivityStackFrame(frame)) {
        const activity: NativeBreakpointActivity = frame.activity;
        const initFrame = vmContext.stack[vmContext.stack.length - 1]!; // last frame is the init frame
        return new NativeBreakpointActivityInternal.ModifiableElement(initFrame.currentContext, activity);
      }
    }
    throw new FExceptionInvalidOperation(`Activity '${NativeBreakpointActivity.name}' was not found in current stack.`);
  }

  // /**
  //  * @deprecated Use NativeBreakpointActivity.of method instead
  //  */
  // public createElement(
  // 	vmContext: WorkflowVirtualMachine.ExecutionContext
  // ): NativeBreakpointActivityElement {
  // 	const initFrame = vmContext.stack[vmContext.stack.length - 1];
  // 	return new NativeBreakpointActivityElement(initFrame.currentExecutionContext, this);
  // }

  // private createModifableElement(
  // 	vmContext: WorkflowVirtualMachine.ExecutionContext
  // ): NativeBreakpointActivityInternal.ModifiableElement {
  // 	const initFrame = vmContext.stack[vmContext.stack.length - 1];
  // 	return new NativeBreakpointActivityInternal.ModifiableElement(initFrame.currentExecutionContext, this);
  // }

  protected async onExecute(executionContext: FExecutionContext): Promise<void> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    const modifiableElement: NativeBreakpointActivityInternal.ModifiableElement =
      NativeBreakpointActivity.ofModifable(vmContext);

    modifiableElement.incrementExecuteCounter();
    modifiableElement.setLastExecuteDateToNow();
    modifiableElement.resetIdle();

    const allowContinue: boolean = await this.onExecuteBreakpoint(executionContext);

    if (allowContinue) {
      // remove itself
      vmContext.stackPop();
    } else {
      return; // Sleep, due breakpoint is active
    }
  }

  /**
   * Returns:
   * `true` - to allow continue execution
   * `false` - to sleep (idle for WfApp engine)
   */
  protected abstract onExecuteBreakpoint(executionContext: FExecutionContext): Promise<boolean>;
}
export namespace NativeBreakpointActivity {
  export interface Element {
    readonly executeCounter: number;
    readonly lastExecuteDate: Date | null;
    readonly isIdle: boolean;
  }
}
export class NativeBreakpointActivityElement<
  TNativeBreakpointActivity extends NativeBreakpointActivity = NativeBreakpointActivity,
> {
  protected readonly _vmContext: WorkflowVirtualMachine.Context;
  // protected readonly _activity: TNativeBreakpointActivity;
  protected readonly _counterKey: string;
  protected readonly _lastexecKey: string;

  public constructor(currentExecutionContext: WorkflowVirtualMachine.Context, activity: TNativeBreakpointActivity) {
    this._vmContext = currentExecutionContext;
    // this._activity = activity;
    const oid: string = activity.oid;
    this._counterKey = `${oid}:counter`;
    this._lastexecKey = `${oid}:lastexec`;
  }

  public get executeCounter(): number {
    return this._vmContext.variables.hasGlobal(this._counterKey)
      ? this._vmContext.variables.getInteger(this._counterKey)
      : 0;
  }
  public get lastExecuteDate(): Date | null {
    return this._vmContext.variables.hasGlobal(this._lastexecKey)
      ? new Date(this._vmContext.variables.getString(this._lastexecKey))
      : null;
  }
  public get isIdle(): boolean {
    return this._vmContext.flags.has(this._vmContext.oid);
  }
  public setIdle(): void {
    this._vmContext.flags.set(this._vmContext.oid);
  }
}
namespace NativeBreakpointActivityInternal {
  export function isNativeBreakpointActivityStackFrame<
    T extends WorkflowVirtualMachine.StackFrame<NativeBreakpointActivity>,
    U extends WorkflowVirtualMachine.StackFrame<Activity>,
  >(frame: T | U): frame is T {
    return frame.activity instanceof NativeBreakpointActivity;
  }

  export class ModifiableElement extends NativeBreakpointActivityElement {
    public incrementExecuteCounter(): void {
      if (!this._vmContext.variables.hasGlobal(this._counterKey)) {
        this._vmContext.variables.defineGlobal(this._counterKey, 1);
      } else {
        this._vmContext.variables.set(this._counterKey, this._vmContext.variables.getInteger(this._counterKey) + 1);
      }
    }
    public setLastExecuteDateToNow(): void {
      const date = new Date();
      if (!this._vmContext.variables.hasGlobal(this._lastexecKey)) {
        this._vmContext.variables.defineGlobal(this._lastexecKey, date.toISOString());
      } else {
        this._vmContext.variables.set(this._lastexecKey, date.toISOString());
      }
    }
    public resetIdle(): void {
      this._vmContext.flags.reset(this._vmContext.oid);
    }
  }
}

export class BreakpointActivity extends NativeBreakpointActivity {
  public readonly initialIsEnabled: boolean;

  public createElement(vmContext: WorkflowVirtualMachine.Context): BreakpointActivityElement {
    const initFrame = vmContext.stack[vmContext.stack.length - 1]!;
    return new BreakpointActivityElement(initFrame.currentContext, this);
  }

  private createInitableElement(vmContext: WorkflowVirtualMachine.Context): BreakpointActivityInternal.InitableElement {
    const initFrame = vmContext.stack[vmContext.stack.length - 1]!;
    return new BreakpointActivityInternal.InitableElement(initFrame.currentContext, this);
  }

  public constructor(opts?: BreakpointActivity.Opts) {
    super();

    this.initialIsEnabled = opts !== undefined && opts.initialIsEnabled !== undefined ? opts.initialIsEnabled : false;
  }

  // public createElement(vmContext: WorkflowVirtualMachine.ExecutionContext): BreakpointActivity.Element {
  // 	const enabledKey: string = `${this.constructor.name}:${this.oid}:enabled`;
  // 	// const enabledKey: string = `${this.constructor.name}:${vmContext.oid}:enabled`;
  // 	if (!vmContext.variables.has(enabledKey)) {
  // 		vmContext.variables.defineGlobal(enabledKey, this.initialIsEnabled);
  // 	}

  // 	const nativeElement: NativeBreakpointActivity.Element = super.createElement(vmContext);

  // 	const element: BreakpointActivity.Element = Object.freeze({
  // 		get executeCounter(): number { return nativeElement.executeCounter; },
  // 		get lastExecuteDate(): Date | null { return nativeElement.lastExecuteDate; },
  // 		get isIdle(): boolean { return nativeElement.isIdle; },
  // 		get isEnabled(): boolean { return vmContext.variables.getBoolean(enabledKey); },
  // 		set isEnabled(value: boolean) { vmContext.variables.set(enabledKey, value); }
  // 	});

  // 	return element;
  // }

  protected async onExecuteBreakpoint(executionContext: FExecutionContext): Promise<boolean> {
    const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    const element: BreakpointActivityInternal.InitableElement = this.createInitableElement(vmContext);

    element.initDefaultValueIfNeeded(this.initialIsEnabled);

    if (element.isEnabled) {
      return false; // Sleep, due breakpoint is active
    }
    return true; // Breakpoint is disabled, so allow continue
  }
}
export namespace BreakpointActivity {
  export interface Opts {
    /**
     * Default value for `isEnabled` flag.
     */
    readonly initialIsEnabled?: boolean;
  }
}
export class BreakpointActivityElement<
  TBreakpointActivity extends BreakpointActivity = BreakpointActivity,
> extends NativeBreakpointActivityElement<TBreakpointActivity> {
  protected readonly _enabledKey: string;

  public constructor(vmContext: WorkflowVirtualMachine.Context, activity: TBreakpointActivity) {
    super(vmContext, activity);
    const oid: string = activity.oid;
    this._enabledKey = `${oid}:enabled`;
  }

  /**
   * State flag:
   * - `true` - Breakpoint is ACTIVE. `WorkflowApplication` will going to sleep
   * when reached it. Should be approved by merchant via `resume` API to continue.
   * - `false` - Breakpoint is NOT active. `WorkflowApplication` will not interrupt by it.
   */
  public get isEnabled(): boolean {
    return this._vmContext.variables.getBoolean(this._enabledKey);
  }

  public set isEnabled(value: boolean) {
    if (!this._vmContext.variables.hasGlobal(this._enabledKey)) {
      this._vmContext.variables.defineGlobal(this._enabledKey, value);
    } else {
      this._vmContext.variables.set(this._enabledKey, value);
    }
  }
}
namespace BreakpointActivityInternal {
  // export function isBreakpointActivityStackFrame<
  // 	T extends WorkflowVirtualMachine.StackFrame<BreakpointActivity>,
  // 	U extends WorkflowVirtualMachine.StackFrame<Activity>
  // >(frame: T | U): frame is T {
  // 	return frame.activity instanceof BreakpointActivity;
  // }
  export class InitableElement extends BreakpointActivityElement {
    // private readonly _activity: BreakpointActivity;

    // public constructor(currentExecutionContext: WorkflowVirtualMachine.ExecutionContext, activity: BreakpointActivity) {
    // 	super(currentExecutionContext);
    // 	this._activity = activity;
    // }

    public initDefaultValueIfNeeded(initialIsEnabled: boolean): void {
      if (!this._vmContext.variables.hasGlobal(this._enabledKey)) {
        this._vmContext.variables.defineGlobal(this._enabledKey, initialIsEnabled);
      }
    }
  }
}

export abstract class NamedBreakpointActivity extends BreakpointActivity {
  private readonly _name: string;
  private readonly _description: string;

  public constructor(opts: NamedBreakpointActivity.Opts) {
    if (opts.initialIsEnabled !== undefined) {
      super({ initialIsEnabled: opts.initialIsEnabled });
    } else {
      super();
    }

    this._name = opts.name;
    this._description = opts.description;
  }

  public static findBreakpointActivity(rootActivity: Activity, breakpointName: string): NamedBreakpointActivity | null {
    let breakpointActivity: NamedBreakpointActivity | null = null;
    activityRecursiveWalker(rootActivity, walkActivity => {
      if (walkActivity instanceof NamedBreakpointActivity) {
        if (walkActivity.name === breakpointName) {
          breakpointActivity = walkActivity;
          return false;
        }
      }
      return true; // continue walking
    });
    return breakpointActivity;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string {
    return this._description;
  }
}
export namespace NamedBreakpointActivity {
  export interface Opts extends BreakpointActivity.Opts {
    readonly name: string;
    readonly description: string;
  }
}
