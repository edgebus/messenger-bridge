import { FWebServer } from "@freemework/hosting";

import * as path from "path";
import * as express from "express";

import { BaseEndpoint } from "./_base.endpoint.js";
import { Settings } from "../settings";

export class StaticContentEndpoint extends BaseEndpoint {
	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.Static & { readonly staticFilesDir: string; },
	) {
		super(servers, opts.name, opts);

		const { staticFilesDir } = opts;

		// const staticFilesDir: string = path.join(__dirname, "..", "..", "res", "WelcomePageEndpoint");

		this._router.use(express.static(staticFilesDir, { index: ["index.html"] }));
		this._router.use(function (_req: express.Request, res: express.Response) {
			// 404 Not found
			res.status(404).sendFile(path.join(staticFilesDir, "404.html"));
		});
	}
}
