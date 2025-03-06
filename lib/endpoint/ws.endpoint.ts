import {
	// FEnsure,
	FExceptionInvalidOperation,
	FExecutionContext,
} from "@freemework/common";
import { FWebServer, FWebSocketChannelFactoryEndpoint } from "@freemework/hosting";

import * as WebSocket from "ws";

import { Service } from "../service/approvement.service.js";
import { Settings } from "../settings.js";

//import { fromBuffer, toBuffer } from "../util/ArrayBufferUtils";

// const ensure: FEnsure = FEnsure.create();

export class WSEndpoint extends FWebSocketChannelFactoryEndpoint {
	// private readonly _service: Service;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: Settings.Endpoint.WebSocket,
		_service: Service
	) {
		super(servers, opts);
		// this._service = service;
	}

	public override async createBinaryChannel(
		_executionContext: FExecutionContext,
		_webSocket: WebSocket,
		_subProtocol: string
	): Promise<FWebSocketChannelFactoryEndpoint.BinaryChannel> {
		throw new FExceptionInvalidOperation("Not implemented yet");
	}
}

