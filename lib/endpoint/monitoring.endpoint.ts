import {
	FWebServer,
} from "@freemework/hosting";

import { BaseEndpoint } from "./_base.endpoint.js";
import { Settings } from "../settings.js";
import { Monitoring } from "../service/monitoring.service.js";

export class MonitoringEndpoint extends BaseEndpoint {
	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Monitoring,
		monitoring: Monitoring,
	) {
		super(servers, opts.name, opts);

		this._router.use(monitoring.exposeMiddleware);
	}
}
