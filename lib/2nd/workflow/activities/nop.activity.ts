import { FExecutionContext } from '@freemework/common';

import { Activity } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';
import { WorkflowVirtualMachineNativeExecutionContext } from '../WorkflowVirtualMachine.js';

@Activity.Id('b5a36f0c-b08a-44dc-9a52-7050d7808431')
export class NopActivity extends NativeActivity {
	public constructor() { super(); }

	protected override onExecute(executionContext: FExecutionContext) {
		const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);
		vmContext.stackPop(); // NOP
	}
}
