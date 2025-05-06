import { WorkflowVirtualMachine } from '../WorkflowVirtualMachine.js';

import { Activity, ActivityElement } from './Activity.js';
import { NativeActivity } from './NativeActivity.js';

export abstract class DataContextFactory<TDataContext> {
	public abstract initDataContext(vmContext: WorkflowVirtualMachine.Context, dataContext: TDataContext): void;
	public abstract createDataContext(vmContext: WorkflowVirtualMachine.Context): TDataContext;
}

export abstract class DataContextActivity<TDataContext> extends NativeActivity {
	private readonly _dataContextFactory: DataContextFactory<TDataContext>;

	public constructor(
		dataContextFactory: DataContextFactory<TDataContext>,
		...children: ReadonlyArray<Activity>
	) {
		super(...children);
		this._dataContextFactory = dataContextFactory;
	}

	public get dataContextFactory(): DataContextFactory<TDataContext> {
		return this._dataContextFactory;
	}
}
export class DataContextActivityElement<
	TDataContext,
	TActivity extends DataContextActivity<TDataContext>,
> extends ActivityElement<TActivity> {
	private readonly _dataContextFactory: DataContextFactory<TDataContext>;
	private _dataContext: TDataContext | null;

	public constructor(stackFrame: WorkflowVirtualMachine.StackFrame<TActivity>) {
		super(stackFrame);
		this._dataContextFactory = stackFrame.activity.dataContextFactory;
		this._dataContext = null;
	}

	public get dataContext(): TDataContext {
		if (this._dataContext === null) {
			this._dataContext = this._dataContextFactory.createDataContext(this.vmContext);
		}
		return this._dataContext;
	}
}
