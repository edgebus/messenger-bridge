import { FException, FLogger } from "@freemework/common";
import * as os from "os";
import type { Request, Response } from "express";
import { RequestHandler } from "express";

import promClient from "prom-client";
import promBundle from "express-prom-bundle";

import { appInfo } from "../app-info.js";
import { Bind } from "../utils/bind.js";


export abstract class Monitoring {
	public constructor() {
	}

	public abstract get collectMiddleware(): RequestHandler;

	public abstract get exposeMiddleware(): RequestHandler;
}

export class MonitoringImpl extends Monitoring {
	private readonly _collectMiddleware: promBundle.Middleware;
	private readonly _logger: FLogger;

	public constructor() {
		super();

		this._logger = FLogger.create(this.constructor.name);

		this._collectMiddleware = promBundle(
			{
				metricsPath: "/",
				autoregister: false,
				includeUp: false,
				includeMethod: true,
				includePath: true,
				buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2, 4]
			}
		);

		promClient.register.setDefaultLabels({
			app_name: os.hostname(),
			app_version: appInfo.version
		});

		promClient.collectDefaultMetrics();
	}

	public get collectMiddleware(): RequestHandler {
		return this._collectMiddleware as any;
	}
	public get exposeMiddleware(): RequestHandler {
		return this._exposeMiddleware;
	}

	@Bind
	private async _exposeMiddleware(req: Request, res: Response) {
		const { executionContext } = req;
		try {
			const metrics: string = await promClient.register.metrics();
			const body: Buffer = Buffer.from(metrics, "utf-8");
			res
				.setHeader("Content-Length", Buffer.byteLength(body))
				.setHeader("Content-Type", "text/plain")
				.status(200)
				.end(body);
		} catch (e) {
			const ex: FException = FException.wrapIfNeeded(e);
			this._logger.error(executionContext, () => `Unexpected error. ${ex.message}`);
			this._logger.debug(executionContext, "Unexpected error.", ex);
			if (!res.headersSent) {
				res.writeHead(500, "Internal server error.");
			}
			res.end();
		}
	}
}
