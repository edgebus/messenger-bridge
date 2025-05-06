export {
	Activity,
	ActivityElement,
	IfActivity,
	IfActivityElement,
	CodeActivity,
	LoopActivity,
	LoopActivityElement,
	DelayActivity,
	NativeActivity,
	BusinessActivity,
	ParallelActivity,
	SequenceActivity,
	TryCatchActivity,
	RandomIntActivity,
	BreakpointActivity,
	BreakpointActivityElement,
	ConsoleLogActivity,
	RandomUintActivity,
	DataContextActivity,
	DataContextActivityElement,
	NamedBreakpointActivity,
	NativeBreakpointActivity,
	NativeBreakpointActivityElement,
	DataContextContainerActivity,
} from './activities/index.js';
export { BugDetectedError } from './common.js';
export { WorkflowApplication } from './workflow_application.js';
export { WorkflowCache } from './workflow_cache.js';
export { WorkflowDatabaseFactory } from './workflow_database.js';
export { WorkflowInvoker } from './WorkflowInvoker.js';
export { WorkflowRunner } from './WorkflowRunner.js';
export { WorkflowVirtualMachine } from './WorkflowVirtualMachine.js';
export * from "./identifiers.js";

import { FExceptionInvalidOperation } from '@freemework/common';
import { WorkflowCache, WorkflowDataCacheFacadeRedis } from './workflow_cache.js';

function createWorkflowCacheFromConnectivityUrl(connectivityUrl: URL): WorkflowCache {
	switch (connectivityUrl.protocol) {
		case 'redis:':
			return new WorkflowDataCacheFacadeRedis(connectivityUrl);
		default:
			throw new FExceptionInvalidOperation(`Unsupported workflow cache connectivity protocol '${connectivityUrl.protocol}'`);
	}
}

declare module "./workflow_cache.js" {
	namespace WorkflowCache {
		function fromConnectivityUrl(connectivityUrl: URL): WorkflowCache;
	}
}
WorkflowCache.fromConnectivityUrl = createWorkflowCacheFromConnectivityUrl;
