import { } from "@freemework/common";
import {
	FWebServer,
} from "@freemework/hosting";

import { appInfo } from "../app-info.js";
import { BaseEndpoint } from "./_base.endpoint.js";
import { Settings } from "../settings.js";

export class InfoEndpoint extends BaseEndpoint {
	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Info,
	) {
		super(servers, opts.name, opts);

		this._router.get(
			"/",
			(_, res) => {
				res.writeHead(200, { "content-type": "application/json" }).write(
					JSON.stringify(
						{
							...appInfo,
							time: new Date().toISOString(),
						},
						null,
						"\t",
					),
				);
				res.end();
			},
		);
	}
}
