import { FEnsureException, FException, FExceptionArgument, FExecutionContext, FLogger } from "@freemework/common";
import { FHostingSettings, FServersBindEndpoint, FWebServer } from "@freemework/hosting";

import * as express from "express";

export abstract class BaseEndpoint extends FServersBindEndpoint {
	protected readonly _router: express.Router;
	protected readonly _logger: FLogger;
	protected readonly _endpointName: string;

	public constructor(servers: ReadonlyArray<FWebServer>, endpointName: string, opts: FHostingSettings.BindEndpoint) {
		super(servers, opts);
		this._logger = FLogger.create(this.constructor.name);
		this._endpointName = endpointName;
		this._router = express.Router();
		this._router.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
			if (this.disposing || this.disposed) {
				res.writeHead(503, "Service temporary unavailable. Going to maintenance...").end();
				return;
			} else if (this.initializing) {
				res.writeHead(503, "Service temporary unavailable. Please wait. Launching...").end();
				return;
			} else {
				next();
				return;
			}
		});
	}

	protected override onInit(): void {
		const executionContext: FExecutionContext = this.initExecutionContext;

		for (const server of this._servers) {
			const rootExpressApplication = server.rootExpressApplication;
			rootExpressApplication.use(this._bindPath, this._router);

			this._logger.info(executionContext, () => `Endpoint '${this._endpointName}' was assigned to server '${server.name}' at '${this._bindPath}'`);
		}
	}

	protected override onDispose(): void {
		// NOP
	}

	protected safeBinder(cb: (req: express.Request, res: express.Response) => (void | Promise<void>)) {
		const handler = (req: express.Request, res: express.Response): void => {
			const { executionContext } = req;
			try {
				const result = cb(req, res);
				if (result instanceof Promise) {
					result.catch((e) => this.errorRenderer(executionContext, FException.wrapIfNeeded(e), res));
				}
			} catch (e) {
				this.errorRenderer(executionContext, FException.wrapIfNeeded(e), res);
			}
		};
		return handler;
	}

	protected errorRenderer(executionContext: FExecutionContext, e: FException, res: express.Response): void {
		const logger: FLogger = this._logger;

		if (logger.isWarnEnabled) {
			logger.warn(executionContext, `Unhandled error on ${this.constructor.name}: ${e.message}`);
		} else {
			console.error(`Unhandled error on ${this.constructor.name}: ${e.message}`);
		}

		logger.debug(executionContext, () => `Unhandled error on ${this.constructor.name}`, e);
		if (e instanceof FEnsureException) {
			res.writeHead(400, e.message).end();
		} else if (e instanceof FExceptionArgument) {
			res.writeHead(400, e.constructor.name).end();
		} else {
			res.writeHead(500).end();
		}
	}
}

/**
 * The error shows developer's issues. If this happens, go to dev team.
 */
export class BrokenEndpointError extends FException {
	//
}


