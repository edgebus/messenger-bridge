import {
	FEnsure,
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

const ensure: FEnsure = FEnsure.create();

export class RestEndpoint extends BaseEndpoint {
	private readonly _service: Service;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Rest,
		service: Service
	) {
		super(servers, opts.name, opts);

		this._service = service;

		this._router.get("/approvement", super.safeBinder(this._getTopics));
		this._router.get("/approvement/:topic/:approvementId", super.safeBinder(this._getApprovement));
		this._router.post("/approvement/:topic", bodyParser.json(), super.safeBinder(this._createApprovement));
	}

	@Bind
	private async _getTopics(_req: express.Request, res: express.Response): Promise<void> {
		const topis = [...this._service.approvementTopics.values()];
		res.writeHead(200).end(JSON.stringify(topis, null, "\t"));
	}

	@Bind
	private async _createApprovement(req: express.Request, res: express.Response): Promise<void> {
		const method: string = req.method.toUpperCase();

		let executionContext = req.executionContext;
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

		let executionContext = req.executionContext;
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
}
