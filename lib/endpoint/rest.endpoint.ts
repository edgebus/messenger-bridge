import {
	FEnsure,
	FExecutionContext,
	FLogger,
	FLoggerLabelsExecutionContext,
} from "@freemework/common";
import {
	FWebServer,
} from "@freemework/hosting";

import express from "express";
import bodyParser from "body-parser";

import { BaseEndpoint } from "./_base.endpoint.js";
import { Approvement } from "../model/approvement.js";
import { Settings } from "../settings.js";
import { Service } from "../service/approvement.service.js";
import { Bind } from "../utils/bind.js";
import { Activity, BusinessActivity, CodeActivity, DelayActivity, IfActivity, SequenceActivity, WorkflowApplication, WorkflowCache, WorkflowRunner } from "../2nd/workflow/index.js";
import { WorkflowDatabaseFactory } from "../2nd/workflow/workflow_database.js";
import { WorkflowVirtualMachineExecutionContext } from "../2nd/workflow/WorkflowVirtualMachine.js";

const ensure: FEnsure = FEnsure.create();

export class RestEndpoint extends BaseEndpoint {
	private readonly _service: Service;
	private readonly _workflowCache: WorkflowCache;
	private readonly _workflowDatabaseFactory: WorkflowDatabaseFactory;
	private readonly _workflowRunner: WorkflowRunner;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Rest,
		service: Service,
		workflowCache: WorkflowCache,
		workflowDatabaseFactory: WorkflowDatabaseFactory,
		workflowRunner: WorkflowRunner,
	) {
		super(servers, opts.name, opts);

		this._workflowCache = workflowCache;
		this._workflowDatabaseFactory = workflowDatabaseFactory;
		this._workflowRunner = workflowRunner;

		this._service = service;

		this._router.get("/approvement", super.safeBinder(this._getTopics));
		this._router.get("/approvement/:topic/:approvementId", super.safeBinder(this._getApprovement));
		this._router.post("/approvement/:topic", bodyParser.json(), super.safeBinder(this._createApprovement));

		this._router.post("/debug/workflow/failure", bodyParser.json(), super.safeBinder(this._startMyWorkflowFailure));
		this._router.post("/debug/workflow/success", bodyParser.json(), super.safeBinder(this._startMyWorkflowSuccess));
	}

	@Bind
	private async _getTopics(_req: express.Request, res: express.Response): Promise<void> {
		const topis = [...this._service.approvementTopics.values()];
		res.writeHead(200).end(JSON.stringify(topis, null, "\t"));
	}

	/**
	 * 
	 * @example
	 * curl \
	 *  --verbose \
	 *  --request POST \
	 *  --header 'Content-Type: application/json' \
	 *  --data '{"appName":"myApp","appVersion":"0.1.0-rc00"}' \
	 *  http://127.0.0.1:8080/v1/approvement/DeployProduction
	 */
	@Bind
	private async _createApprovement(req: express.Request, res: express.Response): Promise<void> {
		const method: string = req.method.toUpperCase();

		let executionContext: FExecutionContext = req.executionContext;
		executionContext = new FLoggerLabelsExecutionContext(executionContext, {
			"httpMethod": method,
			"httpPath": req.originalUrl
		});

		const topicName: string = ensure.string(req.params['topic']!);
		const renderData: any = req.body;

		const approvement: Approvement = await this._service.createApprovement(executionContext, topicName, renderData);

		res.writeHead(200).end(JSON.stringify({
			approvementId: approvement.approvementId
		}, null, "\t"));
	}

	@Bind
	private async _getApprovement(req: express.Request, res: express.Response): Promise<void> {
		const method: string = req.method.toUpperCase();

		let executionContext: FExecutionContext = req.executionContext;
		executionContext = new FLoggerLabelsExecutionContext(executionContext, {
			"httpMethod": method,
			"httpPath": req.originalUrl
		});

		const topicName: string = ensure.string(req.params['topic']!);
		const approvementId: string = ensure.string(req.params['approvementId']!);

		try {
			const approvement: Service.ApprovementWithStatus = await this._service
				.getApprovement(executionContext, topicName, approvementId);

			res.writeHead(200).end(JSON.stringify({
				approvementId: approvement.approvementId,
				topic: approvement.approvementTopic.name,
				requireVotes: approvement.approvementTopic.requireVotes,
				expireAt: approvement.expireAt.toISOString(),
				status: approvement.status,
				approvedBy: approvement.approvedBy,
				refuseBy: approvement.refuseBy
			}, null, "\t"));
		} catch (e) {
			if (e instanceof Service.NoSuchApprovement) {
				res.writeHead(404, e.message).end();
				return;
			}
			throw e;
		}
	}

	/**
	 * 
	 * @example
	 * curl \
	 *  --verbose \
	 *  --request POST \
	 *  http://127.0.0.1:8080/v1/debug/workflow/failure
	 */
	@Bind
	private async _startMyWorkflowFailure(req: express.Request, res: express.Response) {
		let executionContext: FExecutionContext = req.executionContext;

		const wfActivity = new TestFailureWorkflow();
		const wfApp = WorkflowApplication.create(this._workflowCache, wfActivity);

		await this._workflowDatabaseFactory.using(executionContext, async (dbExecutionContext, workflowDatabase) => {
			await wfApp.persist(dbExecutionContext, workflowDatabase, []);
			await wfApp.unlock(dbExecutionContext);
		});

		res.writeHead(200).end(JSON.stringify({
			wfAppId: wfApp.workflowUuid,
		}, null, "\t"));
	}

	/**
	 * 
	 * @example
	 * curl \
	 *  --verbose \
	 *  --request POST \
	 *  http://127.0.0.1:8080/v1/debug/workflow/success
	 */
	@Bind
	private async _startMyWorkflowSuccess(req: express.Request, res: express.Response) {
		let executionContext: FExecutionContext = req.executionContext;

		const wfActivity = new TestSuccessWorkflow();
		const wfApp = WorkflowApplication.create(this._workflowCache, wfActivity);

		await this._workflowDatabaseFactory.using(executionContext, async (dbExecutionContext, workflowDatabase) => {
			await wfApp.persist(dbExecutionContext, workflowDatabase, []);
			await wfApp.unlock(dbExecutionContext);
		});

		res.writeHead(200).end(JSON.stringify({
			wfAppId: wfApp.workflowUuid,
		}, null, "\t"));
	}

}


class OddTimeConditionActivity extends BusinessActivity {
	protected onExecute(executionContext: FExecutionContext): void | Promise<void> {
		const { vmContext } = WorkflowVirtualMachineExecutionContext.of(executionContext);

		const now = new Date();
		if (now.getHours() % 2 === 0) {
			IfActivity.of(vmContext).markTrue();
		} else {
			IfActivity.of(vmContext).markFalse();
		}
	}
}

class LogActivity extends BusinessActivity {
	private readonly logger;

	public constructor(private readonly msg: string) {
		super();
		this.logger = FLogger.create(this.constructor.name);
	}

	protected onExecute(executionContext: FExecutionContext): void | Promise<void> {
		this.logger.info(executionContext, () => this.msg);
	}
}

@Activity.Id('13203327-2a4e-42e3-a024-e70d6976d8c7')
export class TestSuccessWorkflow extends SequenceActivity {
	public constructor() {
		super(
			new LogActivity('Text 0'),
			new DelayActivity({ durationMilliseconds: 30000 }),
			new IfActivity({
				conditionActivity: new OddTimeConditionActivity(),
				trueActivity: new SequenceActivity(
					new LogActivity('Text 1'),
					new DelayActivity({ durationMilliseconds: 30000 }),
				),
				falseActivity: new SequenceActivity(
					new LogActivity('Text 2'),
					new DelayActivity({ durationMilliseconds: 30000 }),
				),
			}),
			new LogActivity('Text 3'),
			new DelayActivity({ durationMilliseconds: 30000 }),
			new LogActivity('Text 4'),
			new DelayActivity({ durationMilliseconds: 30000 }),
		);
	}
}

@Activity.Id('52aa707b-de24-48f8-9a7a-c207c107057c')
export class TestFailureWorkflow extends SequenceActivity {
	public constructor() {
		super(
			new LogActivity('Text 0'),
			new DelayActivity({ durationMilliseconds: 30000 }),
			new IfActivity({
				conditionActivity: new OddTimeConditionActivity(),
				trueActivity: new SequenceActivity(
					new LogActivity('Text 1'),
					new DelayActivity({ durationMilliseconds: 30000 }),
				),
				falseActivity: new SequenceActivity(
					new LogActivity('Text 2'),
					new DelayActivity({ durationMilliseconds: 30000 }),
				),
			}),
			new LogActivity('Text 3'),
			new DelayActivity({ durationMilliseconds: 30000 }),
			new LogActivity('Text 4'),
			new DelayActivity({ durationMilliseconds: 30000 }),
			new CodeActivity({
				// eslint-disable-next-line func-names, object-shorthand
				callback: function (executionContext: FExecutionContext) {
					//
					throw new Error('Emulate failure.');
				},
			}),
		);
	}
}

