import 'reflect-metadata';
import * as semver from 'semver';

import { FExceptionArgument, FExceptionInvalidOperation } from '@freemework/common';

import { WorkflowVirtualMachine } from '../WorkflowVirtualMachine.js';

const activitiesMapSymbol = Symbol.for('a5bf9499-1a9e-4a35-98dc-de8ff90ed6d3');
const G: any = global || {};
if (!(activitiesMapSymbol in G)) {
  G[activitiesMapSymbol] = Object.freeze({ byId: new Map(), byCtor: new Map() });
}

export abstract class Activity {
  private static _version: string | null = null;
  private readonly _children: ReadonlyArray<Activity>;
  private _parent: Activity | null = null;

  public constructor(...children: ReadonlyArray<Activity>) {
    this._children = Object.freeze(children);

    for (const childActivity of children) {
      Activity.setParent(childActivity, this);
    }
  }

  public static getActivityConstructor(activityUUID: string): Activity.Constructor {
    const activityConstructor = G[activitiesMapSymbol].byId.get(activityUUID);
    if (activityConstructor === undefined) {
      throw new FExceptionInvalidOperation(`Wrong operation. An activityUUID: '${activityUUID}' is not registered.`);
    }
    return activityConstructor;
  }

  public static getActivityUUID(activityConstructor: Activity.Constructor): string {
    const activityUUID = G[activitiesMapSymbol].byCtor.get(activityConstructor);
    if (activityUUID === undefined) {
      throw new FExceptionInvalidOperation(
        `Wrong operation. An activity '${activityConstructor.name}' does not define Id decorator.`,
      );
    }
    return activityUUID;
  }

  public static registerActivity(activityUUID: string, activityConstructor: Activity.Constructor): void {
    if (G[activitiesMapSymbol].byId.has(activityUUID)) {
      throw new FExceptionInvalidOperation(
        `Wrong operation. An activityUUID: '${activityUUID}' already registered. Duplicate?`,
      );
    }

    G[activitiesMapSymbol].byId.set(activityUUID, activityConstructor);
    G[activitiesMapSymbol].byCtor.set(activityConstructor, activityUUID);
  }

  public static get appVersion(): string {
    if (this._version === null) {
      throw new FExceptionInvalidOperation(
        'You may not use any Activity before set appVersion. It is recommend to set Activity.appVersion = X.Y.Z, where X.Y.Z is version in your package.json.',
      );
    }
    return this._version;
  }
  public static set appVersion(version: string) {
    if (this._version !== null) {
      throw new FExceptionInvalidOperation('Unable to set Activity.appVersion twice.');
    }

    const sv: semver.SemVer | null = semver.parse(version);
    if (sv === null) {
      throw new FExceptionArgument(
        `Wrong value "${version}" for Activity.appVersion. Expect proper SemVer described at https://semver.org/`,
      );
    }
    const { major, minor } = sv;
    this._version = `${major}.${minor}`;
  }

  public get activityUUID(): string {
    return Activity.getActivityUUID(this.constructor as Activity.Constructor);
  }

  public get children(): ReadonlyArray<Activity> {
    return this._children;
  }

  public get oid(): string {
    let oid = '';

    activityRecursiveWalker(this.root, (walk, steps) => {
      if (walk === this) {
        oid = steps.join('.');
      }
      return true;
    });

    return oid;
  }

  public get parent(): Activity {
    if (this._parent === null) {
      throw new FExceptionInvalidOperation('parent is not set yet');
    }
    return this._parent;
  }

  public get root(): Activity {
    if (this._parent === null) {
      return this;
    }
    return this._parent.root;
  }

  private static setParent(activity: Activity, parent: Activity) {
    if (activity._parent !== null) {
      throw new FExceptionInvalidOperation('Activity parent cannot be set twice');
    }
    activity._parent = parent;
  }
}

export namespace Activity {
  export function Id(activityUUID: string): ClassDecorator {
    function decorator(target: Function): void {
      Activity.registerActivity(activityUUID, target as Activity.Constructor);
    }
    return decorator;
  }

  export interface Constructor extends Function {
    new <T extends Activity>(): T;
    new <T extends Activity>(...children: ReadonlyArray<Activity>): T;
  }
}

export class ActivityElement<TActivity extends Activity> {
  private readonly _stackFrame: WorkflowVirtualMachine.StackFrame<TActivity>;

  public constructor(stackFrame: WorkflowVirtualMachine.StackFrame<TActivity>) {
    this._stackFrame = stackFrame;
  }

  /**
   * Gets reference to an Activity related to the current current element
   */
  public get activity(): TActivity {
    return this._stackFrame.activity;
  }

  /**
   * Gets an instance of ExecutionContext related to the current element
   */
  protected get vmContext(): WorkflowVirtualMachine.Context {
    return this._stackFrame.currentContext;
  }
}

function activityRecursiveWalkerImpl(
  activity: Activity,
  currentIndexPath: ReadonlyArray<number>,
  callback: (walk: Activity, indexPath: ReadonlyArray<number>) => boolean,
): void {
  const continueWalking: boolean = callback(activity, [...currentIndexPath]);

  if (!continueWalking) {
    return;
  }

  for (let childActivityIndex = 0; childActivityIndex < activity.children.length; ++childActivityIndex) {
    const childActivity = activity.children[childActivityIndex]!;
    activityRecursiveWalkerImpl(childActivity, [...currentIndexPath, childActivityIndex], callback);
  }
}

export function activityRecursiveWalker(
  activity: Activity,
  /**
   * Return `false` from callback function to stop walking
   */
  callback: (walk: Activity, indexPath: ReadonlyArray<number>) => boolean,
): void {
  activityRecursiveWalkerImpl(activity, [], callback);
}
