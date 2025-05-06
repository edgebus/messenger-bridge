import { FExceptionInvalidOperation } from "@freemework/common";

export { MessengerApprovement, Messenger } from "./messenger.js";
export { TelegramMessenger } from "./telegram.messenger.js";
export {
	MessengerDialogChooseVariant,
	MessengerDialogChooseVariantGroup,
	MessengerDialogChooseVariantText,
} from "./messenger_dialog.js"
export * from "./messenger_kind.js";

import { Settings } from "../settings.js";
import { Messenger } from "./messenger.js";
import { TelegramMessenger } from "./telegram.messenger.js";
import { InMemory } from "../database/memory/memory.database.js";

export function messengersFactory(
	settings: Settings,
): ReadonlyMap<Settings.Messenger["name"], Messenger> {
	const messengers: Map<Settings.Messenger["name"], Messenger> = new Map();

	const kbDb = new InMemory();

	for (const [messengerName, messengerConfiguration] of settings.messengers) {
		switch (messengerConfiguration.type) {
			case "slack":
				throw new FExceptionInvalidOperation("Not implemented yet");
			case "telegram": {
				const messenger = new TelegramMessenger(
					{
						workerSleepMs: 250,
						telegramApiToken: messengerConfiguration.apiToken
					},
					{
						...messengerConfiguration,
						approvements: settings.approvements,
					},
					kbDb
				);

				messengers.set(messengerName, messenger);
				break;
			}
			default:
				throw new Settings.Messenger.UnreachableMessengerType(messengerConfiguration);

		}
	}

	return messengers;
}
