import { FExceptionArgument, FExceptionInvalidOperation, FExecutionContext } from '@freemework/common';

import { Activity, activityRecursiveWalker } from './Activity.js';
import { NamedBreakpointActivity } from './BreakpointActivity.js';

export abstract class NativeActivity extends Activity {
  private readonly _breakpoints: ReadonlyMap<NamedBreakpointActivity['name'], NamedBreakpointActivity>;

  public constructor(...children: ReadonlyArray<Activity>) {
    super(...children);

    const breakpoints = new Map<NamedBreakpointActivity['name'], NamedBreakpointActivity>();
    activityRecursiveWalker(this, activity => {
      if (activity instanceof NamedBreakpointActivity) {
        if (breakpoints.has(activity.name)) {
          throw new FExceptionInvalidOperation(
            `${this.constructor.name}: Breakpoint name duplicate detected '${activity.name}'`,
          );
        }
        breakpoints.set(activity.name, activity);
      }
      return true;
    });

    // Real runtime read-only map
    this._breakpoints = Object.freeze<ReadonlyMap<NamedBreakpointActivity['name'], NamedBreakpointActivity>>({
      entries: breakpoints.entries.bind(breakpoints),
      forEach: breakpoints.forEach.bind(breakpoints),
      get: breakpoints.get.bind(breakpoints),
      has: breakpoints.has.bind(breakpoints),
      keys: breakpoints.keys.bind(breakpoints),
      size: breakpoints.size,
      values: breakpoints.values.bind(breakpoints),
      [Symbol.iterator]: breakpoints[Symbol.iterator].bind(breakpoints),
    });
  }

  public get breakpoints(): ReadonlyMap<NamedBreakpointActivity['name'], NamedBreakpointActivity> {
    return this._breakpoints;
  }

  public async execute(executionContext: FExecutionContext): Promise<void> {
    // const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

    await this.onExecute(executionContext);
  }

  public resolveChildActivity(activityOid: string): Activity {
    if (activityOid.length === 0) {
      return this;
    }
    const dotIndex: number = activityOid.indexOf('.');

    let search: number;
    let remainOld: string;
    if (dotIndex === -1) {
      search = Number.parseInt(activityOid, 10);
      remainOld = '';
    } else {
      search = Number.parseInt(activityOid.substr(0, dotIndex), 10);
      remainOld = activityOid.substr(dotIndex + 1);
    }

    if (this.children.length > search) {
      const targetActivity = this.children[search]!;
      if (remainOld.length > 0) {
        if (targetActivity instanceof NativeActivity) {
          return targetActivity.resolveChildActivity(remainOld);
        }
        throw new FExceptionArgument(`Wrong value: ${activityOid}. Activity was not found.`, 'activityOid');
      } else {
        return targetActivity;
      }
    } else {
      throw new FExceptionArgument(`Wrong value# ${activityOid}. Activity was not found.`, 'activityOid');
    }
  }

  protected abstract onExecute(executionContext: FExecutionContext): void | Promise<void>;
}
