import { FExceptionArgument } from '@freemework/common';

export namespace WorkflowModel {
  export interface WorkflowId {
    /**
     * Big integer
     */
    readonly workflowId: string;
  }
  export interface TickId {
    /**
     * Big integer
     */
    readonly tickId: string;
  }
  export interface Data {
    readonly workflowUuid: string;
    readonly activityUuid: string;
    readonly activityVersion: string;
  }
  export namespace Tick {
    export interface General {
      readonly workflowVirtualMachineSnapshot: unknown;
      readonly latestExecutedBreakpoint: string | null;
      // readonly crashReport: string | null;
      readonly executedAt: Date;
      readonly nextTickTags: ReadonlyArray<string> | null;
    }

    export interface Operational extends General {
      readonly workflowStatus: Exclude<Status, Status.CRASHED>;
    }

    export interface Crash extends General {
      readonly workflowStatus: Status.CRASHED;
      readonly crashReport: string;
    }
  }
  export type Tick = Tick.Operational | Tick.Crash;
  export interface Creation {
    readonly createdAt: Date;
  }

  export enum Status {
    WORKING = 'WORKING',
    SLEEPING = 'SLEEPING',
    CRASHED = 'CRASHED',
    TERMINATED = 'TERMINATED',
  }
  export namespace Status {
    export function guard(state: string): state is Status {
      const friendlyValue: Status = state as Status;
      switch (friendlyValue) {
        case Status.WORKING:
        case Status.SLEEPING:
        case Status.TERMINATED:
        case Status.CRASHED:
          return true;
        default:
          return guardFalse(friendlyValue);
      }
    }
    export function parse(fiatCurrency: string): Status {
      const friendlyValue: Status = fiatCurrency as Status;
      if (guard(friendlyValue)) {
        return friendlyValue;
      }
      throw new UnreachableNotSupportedWorkflowApplicationStateError(friendlyValue);
    }
    export class UnreachableNotSupportedWorkflowApplicationStateError extends FExceptionArgument {
      public constructor(state: never) {
        super(`Not supported WorkflowApplication state '${JSON.stringify(state)}'`, 'state');
      }
    }
  }
}
export type WorkflowModel = WorkflowModel.WorkflowId &
  WorkflowModel.TickId &
  WorkflowModel.Data &
  WorkflowModel.Tick &
  WorkflowModel.Creation;

function guardFalse(_: never): false {
  return false;
}
