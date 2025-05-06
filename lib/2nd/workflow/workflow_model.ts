import { FExceptionInvalidOperation } from "@freemework/common";

import { ActivityIdentifier, WorkflowIdentifier, WorkflowTickIdentifier } from "./identifiers.js";

export const enum WorkflowStatus {
	WORKING = 'WORKING',
	SLEEPING = 'SLEEPING',
	CRASHED = 'CRASHED',
	TERMINATED = 'TERMINATED',
}
export class UnreachableUnsupportedWorkflowStatus extends FExceptionInvalidOperation {
	public constructor(workflowTypeLike: never) {
		super(`Unsupported WorkflowStatusType value '${workflowTypeLike}'`);
	}
}
export function assertIsWorkflowStatus(workflowStatusLike: unknown): asserts workflowStatusLike is WorkflowStatus {
	const workflowType = workflowStatusLike as WorkflowStatus;
	switch (workflowType) {
		case WorkflowStatus.WORKING:
		case WorkflowStatus.SLEEPING:
		case WorkflowStatus.CRASHED:
		case WorkflowStatus.TERMINATED:
			return;
		default:
			throw new UnreachableUnsupportedWorkflowStatus(workflowType);
	}
}

export namespace Workflow {
	export interface Id {
		readonly workflowId: WorkflowIdentifier;
	}

	export interface Data {
		readonly workflowActivityId: ActivityIdentifier;
		readonly workflowActivityVersion: string;
	}

	export interface Instance {
		readonly workflowCreatedAt: Date;
	}
}
export type Workflow = Workflow.Data & Workflow.Id & Workflow.Instance;

export namespace WorkflowTick {
	export interface Id {
		readonly workflowTickId: WorkflowTickIdentifier;
	}

	export interface PrevTick {
		readonly workflowTickPrevId: WorkflowTickIdentifier | null;
	}

	export namespace Data {
		export interface _Base extends Workflow.Id {
			readonly workflowTickVirtualMachineSnapshot: unknown;
			readonly workflowTickLatestExecutedBreakpoint: string | null;
			readonly workflowTickNextTickTags: ReadonlyArray<string> | null;
			readonly workflowTickExecutedAt: Date;
		}

		export interface DataOperational extends _Base {
			readonly workflowTickStatus: Exclude<WorkflowStatus, WorkflowStatus.CRASHED>;
			readonly workflowTickCrashReport: null;
		}

		export interface DataCrash extends _Base {
			readonly workflowTickStatus: WorkflowStatus.CRASHED;
			readonly workflowTickCrashReport: string;
		}
	}
	export type Data = Data.DataOperational | Data.DataCrash;

	export interface Instance {
		// readonly workflowTickCreatedAt: Date;
	}
}
export type WorkflowTick = WorkflowTick.Data & WorkflowTick.Id & WorkflowTick.Instance;
