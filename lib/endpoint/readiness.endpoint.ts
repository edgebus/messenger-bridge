import { } from "@freemework/common";
import {
	FWebServer,
} from "@freemework/hosting";

import { BaseEndpoint } from "./_base.endpoint.js";
import { Settings } from "../settings.js";

export class ReadinessEndpoint extends BaseEndpoint {
	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Probe,
	) {
		super(servers, opts.name, opts);

		/*
		CURL query example
		```shell
		curl --request GET \
			--header 'Accept: application/json' \
			--verbose \
			http://127.0.0.1:8080/live
		```
		*/

		// No logic yet
		this._router.get(
			"/",
			(_, res) => res.send(
				JSON.stringify(
					{},
					null,
					"\t",
				),
			),
		);
	}
}
