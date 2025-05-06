import {
	FExceptionInvalidOperation,
	FExecutionContext,
	FInitableBase,
	FLogger,
	FLoggerLabelsExecutionContext,
	FSqlConnection,
	FSqlConnectionFactory,
} from "@freemework/common";

import * as _ from "lodash";

import { Settings } from "../settings.js";
import {
	Messenger,
} from "../messenger/index.js";

export abstract class MessengerService {
	public abstract getMessenger(messengerName: Settings.Messenger["name"]): Messenger;
}

export class MessengerServiceImpl extends MessengerService {
	// private readonly _messengers: ReadonlyMap<Settings.Messenger["name"], Messenger>;

	public constructor(
		private readonly _messengers: ReadonlyMap<Settings.Messenger["name"], Messenger>,
	) {
		super();
	}

	public override getMessenger(messengerName: Settings.Messenger["name"]): Messenger {
		const messenger: Messenger | undefined = this._messengers.get(messengerName);
		if (messenger === undefined) {
			throw new FExceptionInvalidOperation();
		}
		return messenger;
	}
}
