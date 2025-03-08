import { FException, FExceptionInvalidOperation, FExecutionContext } from '@freemework/common';

// import { MonitoringExecutionContext } from "../../MonitoringExecutionContext";
import { Activity, NativeActivity, TryCatchActivity } from '../activities/index.js';
import {
  NamedBreakpointActivity,
  NativeBreakpointActivity,
  NativeBreakpointActivityElement,
} from '../activities/BreakpointActivity.js';
import { BusinessActivity } from '../activities/BusinessActivity.js';
import { ContainerActivity } from '../activities/ContainerActivity.js';
import { WorkflowVirtualMachine, WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

/**
 * Technical activity to hold global variables
 */
@Activity.Id('9adbb308-6749-4c42-966d-1ab2288c9958')
class EntryPointInitActivity extends ContainerActivity {
  public constructor(activity: NativeActivity) {
    super(activity);
  }
}

export class WorkflowVirtualMachine1Impl implements WorkflowVirtualMachine {
  private readonly _callstack: Array<StackFrameEx>;
  private readonly _entryPointActivity: NativeActivity;
  private readonly _flags: Map<Activity, Set<string>>;
  private _tickGuard: boolean;
  private _latestExecutedBreakpoint: NamedBreakpointActivity | null;

  public constructor(
    // executionContext: FExecutionContext,
    entryPointActivity: NativeActivity,
    vmData: any | null,
  ) {
    this._callstack = [];
    this._flags = new Map();
    this._entryPointActivity = entryPointActivity;
    this._tickGuard = false;
    this._latestExecutedBreakpoint = null;

    const stackInitActivity = new EntryPointInitActivity(this._entryPointActivity);
    if (vmData === null) {
      let lazyVariables: WorkflowVirtualMachine.Variables;
      // let lazyFlags: WorkflowVirtualMachine.Flags;
      let lazyFrameEx: StackFrameEx<Activity>;
      const self = this;
      const vmContext: WorkflowVirtualMachine.Context = Object.freeze({
        get callCounter() {
          return lazyFrameEx.callCounter;
        },
        // providerLocator,
        oid: stackInitActivity.oid,
        stack: Object.freeze([]),
        get variables() {
          return lazyVariables;
        },
        get flags() {
          return self.flags;
        },
        latestExecutedBreakpoint: null,
      });
      lazyFrameEx = {
        activity: stackInitActivity,
        variables: new Map(),
        callCounter: 0,
        currentContext: vmContext,
      };
      this._callstack.push(lazyFrameEx);
      lazyVariables = this.variables; // CRITICAL: get variables after added into stack
    } else {
      this._callstack = [];
      for (const vmFrame of vmData) {
        const stackCopy = this._callstack.slice();
        let lazyVariables: WorkflowVirtualMachine.Variables;
        let latestExecutedBreakpoint: NamedBreakpointActivity | null = null;
        for (const activity of stackCopy) {
          if (activity instanceof NamedBreakpointActivity) {
            latestExecutedBreakpoint = activity;
            break;
          }
        }
        let lazyFrameEx: StackFrameEx;
        const self = this;
        const activityOid: string = 'o' in vmFrame ? vmFrame.o : vmFrame.activityOid;
        const callCounter: number =
          'c' in vmFrame ? vmFrame.c : 'callCounter' in vmFrame ? vmFrame.callCounter : vmFrame.callCounter;
        const vmContext: WorkflowVirtualMachine.Context = Object.freeze({
          get callCounter() {
            return lazyFrameEx.callCounter;
          },
          // providerLocator,
          oid: activityOid,
          stack: Object.freeze(stackCopy),
          get variables() {
            return lazyVariables;
          },
          get flags() {
            return self.flags;
          },
          latestExecutedBreakpoint,
        });
        lazyFrameEx = {
          activity: stackInitActivity.resolveChildActivity(activityOid),
          variables: new Map(),
          callCounter,
          currentContext: vmContext,
        };
        if ('v' in vmFrame || 'variables' in vmFrame) {
          const variables = vmFrame.v || vmFrame.variables;
          for (const [variableName, variableData] of Object.entries(
            variables as {
              [variable: string]:
                | { s: 'I' | 'L'; d: WorkflowVirtualMachine.Value }
                | { scope: string; value: WorkflowVirtualMachine.Value };
            },
          )) {
            let scope: WorkflowVirtualMachine.Scope;
            let value: WorkflowVirtualMachine.Value;
            if ('scope' in variableData) {
              switch (variableData.scope as string) {
                case 'INHERIT':
                  scope = WorkflowVirtualMachine.Scope.INHERIT;
                  break;
                case 'LOCAL':
                  scope = WorkflowVirtualMachine.Scope.LOCAL;
                  break;
                default:
                  throw new FExceptionInvalidOperation('Broken scope value');
              }
              value = variableData.value;
            } else {
              switch (variableData.s as string) {
                case 'I':
                  scope = WorkflowVirtualMachine.Scope.INHERIT;
                  break;
                case 'L':
                  scope = WorkflowVirtualMachine.Scope.LOCAL;
                  break;
                default:
                  throw new FExceptionInvalidOperation('Broken scope value');
              }
              value = variableData.d;
            }
            lazyFrameEx.variables.set(variableName, {
              scope,
              value,
            });
          }
        }
        this._callstack.push(lazyFrameEx);
        lazyVariables = this.variables; // CRITICAL: get variables after added into stack
      }

      if (this._callstack.length > 0) {
        const stackCopy = this.stack.slice();
        for (const activity of stackCopy) {
          if (activity instanceof NamedBreakpointActivity) {
            this._latestExecutedBreakpoint = activity;
            break;
          }
        }
      }
    }
  }

  public get breakpoints(): ReadonlyMap<NamedBreakpointActivity['name'], NamedBreakpointActivity> {
    const { entryPointActivity } = this;
    if (entryPointActivity instanceof NativeActivity) {
      return entryPointActivity.breakpoints;
    } else {
      throw new FExceptionInvalidOperation('Entry Point Activity does not provide breakpoints.');
    }
  }

  public get currentActivity(): Activity {
    return this.tickFrame.activity;
  }

  public get entryPointActivity(): NativeActivity {
    return this._entryPointActivity;
  }

  /**
   * true - when idle
   * false - when tick is executing right now
   */
  public get isPaused(): boolean {
    return !this._tickGuard;
  }

  public get isTerminated(): boolean {
    return this._callstack.length === 0;
  }

  public get oid(): string {
    return this.currentActivity.oid;
  }

  public get callCounter(): number {
    return this.tickFrame.callCounter;
  }

  public get latestExecutedBreakpoint(): NamedBreakpointActivity | null {
    return this._latestExecutedBreakpoint;
  }

  public get stack(): ReadonlyArray<WorkflowVirtualMachine.StackFrame> {
    return this._callstack
      .map(frame =>
        Object.freeze({
          activity: frame.activity,
          currentContext: frame.currentContext,
        }),
      )
      .reverse();
  }

  public get flags(): WorkflowVirtualMachine.Flags {
    const { currentActivity } = this;
    if (!this._flags.has(currentActivity)) {
      this._flags.set(currentActivity, new Set());
    }
    const flags = this._flags.get(currentActivity)!;

    const has = (name: string): boolean => flags.has(name);
    const reset = (name: string): void => {
      flags.delete(name);
    };
    const set = (name: string): void => {
      flags.add(name);
    };

    return Object.freeze({ has, reset, set });
  }

  public get variables(): WorkflowVirtualMachine.Variables {
    const { tickFrame } = this; // capture frame for closures
    const defineGlobal = (name: string, value: WorkflowVirtualMachine.Value) => {
      if (tickFrame.variables.has(name)) {
        throw new FExceptionInvalidOperation(`Variable '${name}' already defined.`);
      }
      const globalVariables = this.globalFrame.variables;
      if (globalVariables.has(name)) {
        throw new FExceptionInvalidOperation(`Variable '${name}' already defined at global scope.`);
      }
      globalVariables.set(name, {
        scope: WorkflowVirtualMachine.Scope.INHERIT,
        value,
      });
    };
    const defineInherit = (name: string, value: WorkflowVirtualMachine.Value) => {
      if (tickFrame.variables.has(name)) {
        throw new FExceptionInvalidOperation(`Variable '${name}' already defined.`);
      }
      tickFrame.variables.set(name, {
        scope: WorkflowVirtualMachine.Scope.INHERIT,
        value,
      });
    };
    const defineLocal = (name: string, value: WorkflowVirtualMachine.Value) => {
      if (tickFrame.variables.has(name)) {
        throw new FExceptionInvalidOperation(`Variable '${name}' already defined.`);
      }
      tickFrame.variables.set(name, {
        scope: WorkflowVirtualMachine.Scope.LOCAL,
        value,
      });
    };
    const getTuple = (name: string) => {
      const stackCopy: Array<StackFrameEx<Activity>> = this._callstack.slice();
      const tickFrameOid = tickFrame.currentContext.oid;
      while (stackCopy.length > 0 && stackCopy[stackCopy.length - 1]!.currentContext.oid !== tickFrameOid) {
        stackCopy.pop();
      }
      const headIndex = stackCopy.length - 1;
      for (let callstackIndex = headIndex; callstackIndex >= 0; --callstackIndex) {
        const frame: StackFrameEx = stackCopy[callstackIndex]!;
        const valueTuple = frame.variables.get(name);
        if (
          valueTuple !== undefined &&
          (callstackIndex === headIndex || valueTuple.scope === WorkflowVirtualMachine.Scope.INHERIT)
        ) {
          return valueTuple;
        }
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not defined.`);
    };
    const getBoolean = (name: string): boolean => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        throw new FExceptionInvalidOperation(`Variable '${name}' is null.`);
      }
      if (typeof valueTuple.value === "boolean") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not boolean.`);
    };
    const getNullableBoolean = (name: string): boolean | null => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        return null;
      }
      if (typeof valueTuple.value === "boolean") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not boolean.`);
    };
    const getInteger = (name: string): number => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        throw new FExceptionInvalidOperation(`Variable '${name}' is null.`);
      }
      if (Number.isSafeInteger(valueTuple.value)) {
        return valueTuple.value as number;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const getNullableInteger = (name: string): number | null => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        return null;
      }
      if (Number.isSafeInteger(valueTuple.value)) {
        return valueTuple.value as number;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const getNumber = (name: string): number => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        throw new FExceptionInvalidOperation(`Variable '${name}' is null.`);
      }
      if (typeof valueTuple.value === "number") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const getNullableNumber = (name: string): number | null => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        return null;
      }
      if (typeof valueTuple.value === "number") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const getString = (name: string): string => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        throw new FExceptionInvalidOperation(`Variable '${name}' is null.`);
      }
      if (typeof valueTuple.value === "string") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const getNullableString = (name: string): string | null => {
      const valueTuple = getTuple(name);
      if (valueTuple.value === null) {
        return null;
      }
      if (typeof valueTuple.value === "string") {
        return valueTuple.value;
      }
      throw new FExceptionInvalidOperation(`Variable '${name}' is not string.`);
    };
    const has = (name: string) => {
      const stackCopy: Array<StackFrameEx<Activity>> = this._callstack.slice();
      const tickFrameOid = tickFrame.currentContext.oid;
      while (stackCopy.length > 0 && stackCopy[stackCopy.length - 1]!.currentContext.oid !== tickFrameOid) {
        stackCopy.pop();
      }
      const headIndex = stackCopy.length - 1;
      for (let callstackIndex = headIndex; callstackIndex >= 0; --callstackIndex) {
        const frame: StackFrameEx = stackCopy[callstackIndex]!;
        const valueTuple = frame.variables.get(name);
        if (
          valueTuple !== undefined &&
          (callstackIndex === headIndex || valueTuple.scope === WorkflowVirtualMachine.Scope.INHERIT)
        ) {
          return true;
        }
      }
      return false;
    };
    const hasGlobal = (name: string) => {
      const globalVariables = this.globalFrame.variables;
      const valueTuple = globalVariables.get(name);
      return valueTuple !== undefined;
    };
    const hasLocal = (name: string) => {
      const currentFrameVariables = tickFrame.variables;
      const valueTuple = currentFrameVariables.get(name);
      return valueTuple !== undefined;
    };
    const set = (name: string, value: WorkflowVirtualMachine.Value) => {
      const valueTuple = getTuple(name);
      valueTuple.value = value;
    };

    return Object.freeze({
      defineGlobal,
      defineInherit,
      defineLocal,
      getBoolean,
      getNullableBoolean,
      getInteger,
      getNullableInteger,
      getNumber,
      getNullableNumber,
      getString,
      getNullableString,
      has,
      hasGlobal,
      hasLocal,
      set,
    });
  }

  public getExceptionData(): { readonly message: string; readonly stack: ReadonlyArray<Activity> } | null {
    if (!(this.variables.hasLocal('') || this.variables.hasLocal(`${this.constructor.name}:ExceptionHandler`))) {
      throw new FExceptionInvalidOperation(
        'Wrong operation. Cannot getExceptionHandler due it was not set. Use setupExceptionHandler() to setup exception handler.',
      );
    }
    let exceptionData: string | null;
    if (this.variables.hasLocal('')) {
      exceptionData = this.variables.getNullableString('');
    } else {
      exceptionData = this.variables.getNullableString(`${this.constructor.name}:ExceptionHandler`);
    }
    if (exceptionData === null) {
      return null;
    }

    const { message, stack } = JSON.parse(exceptionData);

    // TODO ensure for message and stack

    return Object.freeze({ message, stack: Object.freeze(stack) });
  }

  public hasExceptionHandler(): boolean {
    return this.variables.hasLocal('') || this.variables.hasLocal(`${this.constructor.name}:ExceptionHandler`);
  }

  public setupExceptionHandler(): void {
    this.variables.defineLocal('', null);
  }

  public async stackPush(_executionContext: FExecutionContext, index: number): Promise<void> {
    const frame: StackFrameEx | undefined = this._callstack[this._callstack.length - 1]!;
    const parent = frame.activity as NativeActivity;
    const activity: Activity = parent.children[index]!;

    if (activity instanceof NamedBreakpointActivity) {
      this._latestExecutedBreakpoint = activity;
    }

    const stackCopy = this._callstack.slice();
    let lazyVariables: WorkflowVirtualMachine.Variables;
    let lazyFrameEx: StackFrameEx<Activity>;
    const vmContext: WorkflowVirtualMachine.Context = Object.freeze({
      get callCounter() {
        return lazyFrameEx.callCounter;
      },
      oid: activity.oid,
      stack: Object.freeze(stackCopy),
      get variables() {
        return lazyVariables;
      },
      flags: this.flags,
      latestExecutedBreakpoint: this._latestExecutedBreakpoint,
    });
    lazyFrameEx = {
      activity,
      variables: new Map(),
      callCounter: 0,
      currentContext: vmContext,
    };
    this._callstack.push(lazyFrameEx);
    lazyVariables = this.variables; // CRITICAL: get variables after added into stack
  }

  public stackPop(): void {
    const frame = this._callstack.pop();
    if (frame === undefined) {
      throw new FExceptionInvalidOperation('Stack underflow');
    }
  }

  public async tick(executionContext: FExecutionContext): Promise<boolean> {
    if (this._tickGuard === true) {
      throw new FExceptionInvalidOperation(
        "Wrong operation at current state. The method 'tick' cannot be called in parallel. Did you wait for resolve a Promise of previous call?",
      );
    }
    try {
      this._tickGuard = true;

      if (this._callstack.length === 0) {
        return true; // Nothing to do. Fully completed.
      }

      const frameEx: StackFrameEx | undefined = this._callstack[this._callstack.length - 1];
      if (frameEx !== undefined) {
        const lazyFrameEx: StackFrameEx = frameEx;
        const { activity } = lazyFrameEx;
        ++lazyFrameEx.callCounter;

        const self = this;
        const currentVmContext: WorkflowVirtualMachine.NativeContext = Object.freeze({
          get callCounter() {
            return lazyFrameEx.callCounter;
          },
          get oid() {
            return self.oid;
          },
          get stack() {
            return self.stack;
          },
          get variables() {
            return self.variables;
          },
          get flags() {
            return self.flags;
          },
          get latestExecutedBreakpoint() {
            return self.latestExecutedBreakpoint;
          },
          setupExceptionHandler(): void {
            self.setupExceptionHandler();
          },
          getExceptionData(): { readonly message: string; readonly stack: readonly Activity[] } | null {
            return self.getExceptionData();
          },
          hasExceptionHandler(): boolean {
            return self.hasExceptionHandler();
          },
          async stackPush(executionContext: FExecutionContext, child: number): Promise<void> {
            await self.stackPush(executionContext, child);
          },
          stackPop(): void {
            self.stackPop();
          },
        });

        const wvmExecutionContext: FExecutionContext = new WorkflowVirtualMachineNativeExecutionContext(
          executionContext,
          currentVmContext,
        );
        if (activity instanceof NativeBreakpointActivity) {
          const breakpointElement: NativeBreakpointActivityElement = NativeBreakpointActivity.of(currentVmContext);
          await activity.execute(wvmExecutionContext);
          return breakpointElement.isIdle;
        } else if (activity instanceof BusinessActivity) {
          await activity.execute(wvmExecutionContext);
          this.stackPop(); // BusinessActivity does not know anything of the stack, so remove it from stack
        } else if (activity instanceof NativeActivity) {
          await activity.execute(wvmExecutionContext);
        } else {
          throw new FExceptionInvalidOperation(`Not supported Activity type: ${activity.constructor.name}`);
        }
      }

      return false;
    } catch (e) {
      const err: FException = FException.wrapIfNeeded(e);
      // MonitoringExecutionContext.of(executionContext).handleError(err);
      const activitiesStack: Array<WorkflowVirtualMachine.StackFrame> = this.stack.slice();
      const callstackReverseCopy: Array<StackFrameEx> = this._callstack.slice().reverse();
      for (const rollbackFrame of callstackReverseCopy) {
        if (rollbackFrame.activity instanceof TryCatchActivity) {
          let varData: VariableData | undefined = rollbackFrame.variables.get('');
          if (varData === undefined) {
            varData = rollbackFrame.variables.get(`${this.constructor.name}:ExceptionHandler`);
          }
          if (varData !== undefined && varData.value === null) {
            varData.value = JSON.stringify({
              message: err.message,
              stack: activitiesStack.map(activity => activity.constructor.name),
            });

            while (
              this._callstack.length > 0 &&
              this._callstack[this._callstack.length - 1]!.activity !== rollbackFrame.activity
            ) {
              this._callstack.pop();
            }

            console.error(err);

            return false; // continute VM
          }
        }
      }
      throw err;
    } finally {
      this._tickGuard = false;
    }
  }

  public toJSON(): any {
    return this._callstack.map(frame => {
      const variables: {
        [variable: string]: {
          readonly s: 'I' | 'L';
          readonly d: WorkflowVirtualMachine.Value;
        };
      } = {};
      frame.variables.forEach((variableData, variableName) => {
        let s: 'I' | 'L';
        switch (variableData.scope) {
          case WorkflowVirtualMachine.Scope.INHERIT:
            s = 'I';
            break;
          case WorkflowVirtualMachine.Scope.LOCAL:
            s = 'L';
            break;
          default:
            throw new FExceptionInvalidOperation();
        }

        variables[variableName] = Object.freeze({
          s,
          d: variableData.value,
        });
      });
      const frameData: any = {
        o: frame.activity.oid,
        c: frame.callCounter,
      };
      if (Object.keys(variables).length > 0) {
        frameData.v = Object.freeze(variables);
      }
      return Object.freeze(frameData);
    });
  }

  private get globalFrame(): StackFrameEx<EntryPointInitActivity> {
    if (this._callstack.length === 0) {
      throw new FExceptionInvalidOperation('Wrong operation. Cannot obtain globalFrame on terminated workflow.');
    }
    return this._callstack[0] as StackFrameEx<EntryPointInitActivity>;
  }

  private get tickFrame(): StackFrameEx {
    if (this._callstack.length === 0) {
      throw new FExceptionInvalidOperation('Wrong operation. Cannot obtain tickFrame on terminated workflow.');
    }
    return this._callstack[this._callstack.length - 1]!;
  }
}

interface VariableData {
  readonly scope: WorkflowVirtualMachine.Scope;
  value: WorkflowVirtualMachine.Value;
}

interface StackFrameEx<TActivity extends Activity = Activity> extends WorkflowVirtualMachine.StackFrame<TActivity> {
  readonly variables: Map<string, VariableData>;
  callCounter: number;
}
