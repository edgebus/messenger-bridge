import {
	FLogger,
	FCancellationTokenSourceManual,
	FEnsure,
	FEnsureException,
	FExceptionInvalidOperation,
	FUsing,
	FExceptionArgument,
	FExecutionContext,
	FException,
	FDisposableBase,
	FWebClient,
	FHttpClient,
	FCancellationException,
	FCancellationExecutionContext,
	FLoggerLevel,
	FLoggerLabelsExecutionContext,
} from "@freemework/common";

import * as _ from "lodash";

import { Settings } from "../settings.js";
import { Bind } from "../utils/bind.js";
import { MessengerApprovement, Messenger, MessengerDialog } from "./messenger.js";
import { ApprovementId, ApprovementTopicName } from "../model/primitives.js";
import { KeyValueDb } from "../database/memory/memory.database.js";
import { ApprovementTopic } from "../model/approvement_topic.js";
import { Approver } from "../model/approver.js";
import { MessengerDialogChooseVariant, MessengerDialogChooseVariantGroup, MessengerDialogChooseVariantText } from "./messenger_dialog.js";
import { DialogIdentifier } from "../model/identifiers.js";

const approvementMessageTokenEnsure: FEnsure = FEnsure.create((message, data) => {
	throw new TelegramMessenger.ApprovementMessageTokenError(message, data);
});
const protocolEnsure: FEnsure = FEnsure.create((message, data) => {
	throw new TelegramMessenger.TelegramProtocolError(message, data);
});

export class TelegramMessenger extends Messenger {
	private readonly _logger: FLogger;
	private readonly _workerSleepMs: TelegramMessenger.Opts["workerSleepMs"];
	private readonly _telegram: TelegramApiClient;
	private readonly _disposeCancellationTokenSource: FCancellationTokenSourceManual;
	private readonly _approvement: MessengerApprovementImpl;
	private readonly _dialog: MessengerDialogImpl;
	// private readonly _workflowBindings: ReadonlyMap<
	// 	Settings.Messenger.Telegram.WorkflowBinding["bindWorkflow"],
	// 	Settings.Messenger.Telegram.WorkflowBinding
	// >;
	private _workerTimeout: NodeJS.Timeout | null;
	private _safeWorkerTask: Promise<void> | null;
	private _latestProcessedUpdateId: number | null;

	public constructor(
		opts: TelegramMessenger.Opts,
		configuration: TelegramMessenger.Configuration,
		kvDb: KeyValueDb
	) {
		if (opts.workerSleepMs < 240 || opts.workerSleepMs > 60000) {
			throw new FExceptionArgument(
				`Wrong workerSleepMs value: ${opts.workerSleepMs}. Expected a value in range [240..60000].`,
				"opts.workerSleepMs"
			);
		}

		super(configuration, kvDb);

		this._logger = FLogger.create(this.constructor.name);
		this._disposeCancellationTokenSource = new FCancellationTokenSourceManual();
		this._workerSleepMs = opts.workerSleepMs;
		this._workerTimeout = null;
		this._safeWorkerTask = null;
		this._latestProcessedUpdateId = null;
		this._telegram = new TelegramApiClient({ telegramApiToken: opts.telegramApiToken });

		// this._workflowBindings = configuration.workflowBindings;
		this._approvement = new MessengerApprovementImpl(configuration, this._telegram, this, this._logger);
		this._dialog = new MessengerDialogImpl(configuration, this._telegram, this, this._logger);
	}

	public get approvement(): MessengerApprovement { return this._approvement; }
	public get dialog(): MessengerDialog { return this._dialog; }
	public get kvDb(): KeyValueDb { return this._kvDb; }
	public override get name(): string { return this._configuration.name; }

	/**
	 * @inheritdoc
	 */
	protected async onInit(): Promise<void> {
		const logger: FLogger = this._logger;
		const executionContext: FExecutionContext = this.initExecutionContext;

		logger.debug(executionContext, () => "Initializing...");
		this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
		logger.debug(executionContext, () => "Initialized.");
	}

	/**
	 * @inheritdoc
	 */
	protected async onDispose(): Promise<void> {
		const logger: FLogger = this._logger;
		const executionContext: FExecutionContext = this.initExecutionContext;

		logger.debug(executionContext, () => "Disposing...");

		if (this._workerTimeout !== null) {
			clearTimeout(this._workerTimeout);
			this._workerTimeout = null;
		}

		this._disposeCancellationTokenSource.cancel();

		if (this._safeWorkerTask !== null) {
			await this._safeWorkerTask;
		}

		logger.debug(executionContext, () => "Disposed");
	}

	// private get configuration(): TelegramMessenger.Configuration {
	// 	return this._configuration as TelegramMessenger.Configuration;
	// }

	/**
	 * Implements exception safe infinity loop to 
	 * continuously execute method `_backgroundWorkerJob`.
	 */
	@Bind
	private _backgroundWorker(): void {
		if (this.disposing || this.disposed) { return; }

		const executionContext: FExecutionContext = this.initExecutionContext;

		if (this._safeWorkerTask) {
			this._logger.error(executionContext, () => "[BUG] Illegal operation at current state. Previous worker is not completed yet.");
			return;
		}

		this._safeWorkerTask = this._backgroundWorkerJob()
			.catch(reason => {
				if (reason instanceof FCancellationException) {
					this._logger.debug(executionContext, () => "Worker job was cancelled.");
					return;
				}

				const err = FException.wrapIfNeeded(reason);
				this._logger.info(executionContext, () => `Worker job failure. Error: ${err.message}`);
				this._logger.trace(executionContext, () => `Worker job failure.`, err);
			})
			.finally(() => {
				this._safeWorkerTask = null;
				this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
			});
	}

	private async _backgroundWorkerJob(): Promise<void> {
		const opts = this._latestProcessedUpdateId !== null
			? {
				offset: this._latestProcessedUpdateId + 1
			}
			: {
				//
			};


		const executionContext: FExecutionContext = new FCancellationExecutionContext(
			FExecutionContext.Default,
			this._disposeCancellationTokenSource.token
		);

		const updatesData = await this._telegram.getUpdates(
			executionContext,
			opts
		);

		for (const update of updatesData) {
			try {
				if (update.message !== undefined) {
					await this._onUpdateMessage(executionContext, update.message);
				} else if (update.callback_query !== undefined) {
					await this._onUpdateCallbackQuery(executionContext, update.callback_query);
				} else {
					this._logger.debug(executionContext, () => `Skip unsupported update: ${JSON.stringify(update)}`);
				}
			} catch (e) {
				const ex: FException = FException.wrapIfNeeded(e);
				this._logger.warn(executionContext, ex.message);
			}

			this._latestProcessedUpdateId = this._latestProcessedUpdateId !== null
				? Math.max(this._latestProcessedUpdateId, update.update_id)
				: this._latestProcessedUpdateId = update.update_id;
		}

		this._logger.info(executionContext, () => `${updatesData.length} updates processed`);
	}

	private async _onUpdateCallbackQuery(executionContext: FExecutionContext, query: TelegramApiClientInternal.CallbackQuery): Promise<void> {
		if (await this._approvement.tryHandleUpdateCallbackQuery(executionContext, query)) {
			// handled by approvement feature
			return;
		}

		if (await this._dialog.tryHandleUpdateCallbackQuery(executionContext, query)) {
			// handled by dialog feature
			return;
		}
	}

	private async _onUpdateMessage(executionContext: FExecutionContext, message: TelegramApiClientInternal.Message): Promise<void> {
		executionContext = new FLoggerLabelsExecutionContext(executionContext, {
			"telegram_message_id": message.message_id.toString(),
			"telegram_user_id": message.from.id.toString(),
			...(message.from.username !== undefined ? { "telegram_user_name": message.from.username } : {})
		});

		this._logger.trace(executionContext, () => `Got a message: ${JSON.stringify(message)}`);

		if (await this._approvement.tryHandleUpdateMessage(executionContext, message)) {
			// handled by approvement feature
			return;
		}

		if (await this._dialog.tryHandleUpdateMessage(executionContext, message)) {
			// handled by dialog feature
			return;
		}
	}
}

export namespace TelegramMessenger {
	export interface Opts extends TelegramApiClient.Opts {
		readonly workerSleepMs: number;
	}
	export interface Configuration extends Settings.Messenger.Telegram {
		readonly approvements: ReadonlyMap<ApprovementTopicName, ApprovementTopic>;
	}

	export class ApprovementMessageTokenError extends FEnsureException { }
	export class TelegramProtocolError extends FEnsureException { }
}

namespace TelegramMessengerInternal {
	export class ApproverImpl implements Approver.Telegram {
		public readonly source: "telegram" = "telegram";

		public constructor(
			public readonly username: string,
			public readonly chat_id: string,
			// public readonly chat_title: string,
			public readonly chat_type: string,
			public readonly message_id: number,
			public readonly createdAt: Date
		) { }

		public equalTo(other: Approver): boolean {
			return this.source === other.source
				&& this.username === other.username
				&& this.chat_id === other.chat_id
				// && this.chat_title === other.chat_title
				&& this.message_id === other.message_id
				&& this.createdAt.getTime() === other.createdAt.getTime()
				;
		}

		public toString(): string {
			return `${this.source}/${this.username}`;
		}
	}
}

/**
 * API client for https://core.telegram.org/bots/api
 */
class TelegramApiClient extends FDisposableBase {
	private readonly _webClient: TelegramApiClientInternal.TelegramWebClient;

	public constructor(opts: TelegramApiClient.Opts) {
		const apiUrl: URL = new URL("https://api.telegram.org/");
		apiUrl.pathname = `bot${opts.telegramApiToken}/`;

		super();

		//
		// https://core.telegram.org/bots/api#making-requests
		// All queries to the Telegram Bot API must be served over HTTPS and need
		// to be presented in this form: https://api.telegram.org/bot<token>/METHOD_NAME
		this._webClient = new TelegramApiClientInternal.TelegramWebClient(
			apiUrl,
			{
				httpClient: {
					timeout: 30000,
					logLevelBody: FLoggerLevel.TRACE,
					logLevelHeaders: FLoggerLevel.TRACE,
				},
			},
		);
	}

	/**
	 * Use this method to delete the list of the bot's commands for 
	 * the given scope and user language.
	 * After deletion, higher level commands will be shown to affected users.
	 * 
	 * @see https://core.telegram.org/bots/api#deletemycommands
	 */
	public async deleteMyCommands(
		executionContext: FExecutionContext
	): Promise<void> {
		throw new FExceptionInvalidOperation("Not implemented yet");
	}

	/**
	 * https://core.telegram.org/bots/api#editmessagereplymarkup
	 */
	public async editMessageReplyMarkup(executionContext: FExecutionContext, data: {
		readonly chat_id?: string;
		readonly message_id?: number;
		readonly inline_message_id?: string;
		readonly reply_markup?: TelegramApiClientInternal.InlineKeyboardMarkup | TelegramApiClientInternal.ReplyKeyboardMarkup;
		//| TelegramApiClientInternal.ReplyKeyboardRemove | TelegramApiClientInternal.ForceReply
	}) {
		try {
			const response: FWebClient.Response = await this._webClient
				.postJson(executionContext, "editMessageReplyMarkup", data);
			return response.bodyAsJson;
		} catch (e) {
			if (e instanceof FHttpClient.WebError) {
				console.error(e.body.toString());
			}
			throw e;
		}
	}

	public async editMessageText(executionContext: FExecutionContext, data: {
		/**
		 * Required if inline_message_id is not specified. Unique identifier for the target chat
		 * or username of the target channel (in the format @channelusername)
		 */
		readonly chat_id?: string;
		/**
		 * Required if inline_message_id is not specified. Identifier of the message to edit
		 */
		readonly message_id?: number;
		/**
		 * Required if chat_id and message_id are not specified. Identifier of the inline message
		 */
		readonly inline_message_id?: string;
		/**
		 * Text of the message to be sent, 1-4096 characters after entities parsing.
		 */
		readonly text: string;
		/**
		 * Mode for parsing entities in the message text. See formatting options for more details.
		 */
		readonly parse_mode?: "HTML" | "MarkdownV2",
		/**
		 * Disables link previews for links in this message
		 */
		readonly disable_web_page_preview?: boolean;
		/**
		 * Additional interface options. A JSON-serialized object for an inline keyboard, custom reply keyboard,
		 * instructions to remove reply keyboard or to force a reply from the user.
		 */
		readonly reply_markup?: TelegramApiClientInternal.InlineKeyboardMarkup | TelegramApiClientInternal.ReplyKeyboardMarkup;
		//| TelegramApiClientInternal.ReplyKeyboardRemove | TelegramApiClientInternal.ForceReply
	}) {
		try {
			const response: FWebClient.Response = await this._webClient.postJson(executionContext, "editMessageText", data);
			return response.bodyAsJson.result;
		} catch (e) {
			if (e instanceof FHttpClient.WebError) {
				console.error(e.body.toString());
			}
			throw e;
		}
	}

	public async getMe(executionContext: FExecutionContext): Promise<any> {
		const response: FWebClient.Response = await this._webClient.get(executionContext, "getMe");
		return response.bodyAsJson;
	}

	/**
	 * Use this method to get the current list of the bot's commands 
	 * for the given scope and user language.
	 * 
	 * @returns Returns an Array of BotCommand objects.
	 * If commands aren't set, an empty list is returned.
	 */
	public async getMyCommands(
		executionContext: FExecutionContext,
	): Promise<Array<TelegramApiClientInternal.BotCommand>> {
		throw new FExceptionInvalidOperation("Not implemented yet");
	}

	/**
	 * https://core.telegram.org/bots/api#getupdates
	 */
	public async getUpdates(executionContext: FExecutionContext, data?: {
		/**
		 * Identifier of the first update to be returned. Must be greater by one than the highest
		 * among the identifiers of previously received updates.
		 * By default, updates starting with the earliest unconfirmed update are returned.
		 * An update is considered confirmed as soon as getUpdates is called with an offset higher than its update_id.
		 * The negative offset can be specified to retrieve updates starting from -offset update from
		 * the end of the updates queue. All previous updates will forgotten.
		 */
		readonly offset?: number;

		/**
		 * Limits the number of updates to be retrieved. Values between 1-100 are accepted. Defaults to 100.
		 */
		readonly limit?: number;

		/**
		 * Timeout in seconds for long polling. Defaults to 0, i.e. usual short polling. Should be positive,
		 * short polling should be used for testing purposes only.
		 */
		readonly timeout?: number;

		/**
		 * A JSON-serialized list of the update types you want your bot to receive.
		 * For example, specify [“message”, “edited_channel_post”, “callback_query”]
		 * to only receive updates of these types. See Update for a complete list of
		 * available update types. Specify an empty list to receive all updates regardless
		 * of type (default). If not specified, the previous setting will be used.
		 */
		readonly allowed_updates?: ReadonlyArray<string>;
	}): Promise<Array<TelegramApiClientInternal.Update>> {

		const queryArgs: { [key: string]: string; } = {
			timeout: data !== undefined && data.timeout !== undefined ? data.timeout.toString() : "16"
		};

		if (data !== undefined) {
			if (data.offset !== undefined) {
				queryArgs["offset"] = data.offset.toString();
			}
		}

		const response: FWebClient.Response = await this._webClient.get(executionContext, "getUpdates", {
			queryArgs
		});

		const rawResult = protocolEnsure.array(response.bodyAsJson.result);

		const result: Array<TelegramApiClientInternal.Update> = rawResult.map(rawUpdate => {
			const update_id: number = protocolEnsure.integer(rawUpdate.update_id);

			if ("message" in rawUpdate) {
				// TODO Validate message
				return Object.freeze({
					update_id,
					message: rawUpdate.message
				});
			}

			if ("callback_query" in rawUpdate) {
				// TODO Validate callback_query
				return Object.freeze({
					update_id,
					callback_query: rawUpdate.callback_query
				});
			}

			return Object.freeze({ update_id });
		});

		return result;
	}

	/**
	 * Use this method when you need to tell the user that something is happening on the bot's side.
	 * The status is set for 5 seconds or less (when a message arrives from your bot, Telegram clients
	 * clear its typing status)
	 *
	 * @see https://core.telegram.org/bots/api#sendmessage
	 */
	public async sendChatAction(executionContext: FExecutionContext, data: {
		/**
		 * 	Unique identifier for the target chat or username of the target channel (in the format @channelusername)
		 */
		readonly chat_id: string | number;
		/**
		 * Type of action to broadcast.
		 * Choose one, depending on what the user is about to receive: 
		 * - 'typing' for text messages
		 * - 'upload_photo' for photos
		 * - 'record_video' or 'upload_video' for videos
		 * - 'record_voice' or 'upload_voice' for voice notes
		 * - 'upload_document' for general files
		 * - 'choose_sticker' for stickers
		 * - 'find_location' for location data
		 * - 'record_video_note' or 'upload_video_note' for video notes
		 */
		readonly action:
		| 'typing'
		| 'upload_photo'
		| 'record_video'
		| 'upload_video'
		| 'record_voice'
		| 'upload_voice'
		| 'upload_document'
		| 'choose_sticker'
		| 'find_location'
		| 'record_video_note'
		| 'upload_video_note'
	}): Promise<void> {
		let result;
		try {
			const response: FWebClient.Response = await this._webClient.postJson(executionContext, "sendChatAction", data);
			result = response.bodyAsJson.result;
		} catch (e) {
			if (e instanceof FHttpClient.WebError) {
				console.error(e.body.toString());
			}
			throw e;
		}

		if (typeof result !== "boolean" || result !== true) {
			// https://core.telegram.org/bots/api#sendmessage
			// Returns True on success.
			throw new FException("Failure sendChatAction (returns non true)");
		}
	}

	/**
	 * Use this method to send text messages. On success, the sent  is returned.
	 * 
	 * @returns Message
	 */
	public async sendMessage(executionContext: FExecutionContext, data: {
		/**
		 * 	Unique identifier for the target chat or username of the target channel (in the format @channelusername).
		 */
		readonly chat_id: string | number;
		/**
		 * Text of the message to be sent, 1-4096 characters after entities parsing.
		 */
		readonly text: string;
		/**
		 * Mode for parsing entities in the message text. See formatting options for more details.
		 */
		readonly parse_mode?: "HTML" | "MarkdownV2",
		/**
		 * Disables link previews for links in this message
		 */
		readonly disable_web_page_preview?: boolean;
		/**
		 * Sends the message silently. Users will receive a notification with no sound.
		 */
		readonly disable_notification?: boolean;
		/**
		 * If the message is a reply, ID of the original message.
		 */
		readonly reply_to_message_id?: number;
		/**
		 * Additional interface options. A JSON-serialized object for an inline keyboard, custom reply keyboard,
		 * instructions to remove reply keyboard or to force a reply from the user.
		 */
		readonly reply_markup?:
		| TelegramApiClientInternal.InlineKeyboardMarkup
		| TelegramApiClientInternal.ReplyKeyboardMarkup
		| TelegramApiClientInternal.ReplyKeyboardRemove
		// | TelegramApiClientInternal.ForceReply
		;
	}): Promise<TelegramApiClientInternal.Message> {
		try {
			const response: FWebClient.Response = await this._webClient.postJson(executionContext, "sendMessage", data);
			return response.bodyAsJson.result;
		} catch (e) {
			if (e instanceof FHttpClient.WebError) {
				console.error(e.body.toString());
			}
			throw e;
		}
	}

	/**
	 * Use this method to change the list of the bot's commands.
	 * 
	 * @see https://core.telegram.org/bots/api#setmyname
	 * @see https://core.telegram.org/bots/features#commands
	 */
	public async setMyCommands(
		executionContext: FExecutionContext,
	): Promise<void> {
		throw new FExceptionInvalidOperation("Not implemented yet");
	}

	protected async onDispose(): Promise<void> {
		await this._webClient.dispose();
	}
}

namespace TelegramApiClient {
	export interface Opts {
		/**
		 * https://core.telegram.org/bots#6-botfather
		 */
		readonly telegramApiToken: string;
	}
}

namespace TelegramApiClientInternal {
	export class TelegramWebClient extends FWebClient {
		public override postJson(executionContext: FExecutionContext, urlPath: string, data: any): Promise<FWebClient.Response> {
			return super.invoke(executionContext, urlPath, "POST", {
				headers: {
					"Content-Type": "application/json"
				},
				body: Buffer.from(JSON.stringify(data))
			});
		}
	}

	export const enum ApprovementVote {
		APPROVE = "Y",
		REFUSE = "N"
	}

	export type BotCommand = unknown; // Not implemented yet

	export type ChatId = string;

	/**
	 * This object represents a chat.
	 * 
	 * @see https://core.telegram.org/bots/api#chat
	 */
	export interface Chat {
		/**
		 * Unique identifier for this chat. This number may have more
		 * than 32 significant bits and some programming languages
		 * may have difficulty/silent defects in interpreting it.
		 * But it has at most 52 significant bits, so a signed 64-bit integer
		 * or double-precision float type are safe for storing this identifier.
		 */
		readonly id: number;

		/**
		 * Type of the chat, can be either “private”, “group”, “supergroup” or “channel”
		 */
		readonly type: string;

		/**
		 * Title, for supergroups, channels and group chats
		 */
		readonly title: string;

		/**
		 * Username, for private chats, supergroups and channels if available
		 */
		readonly username: string;

		/**
		 * First name of the other party in a private chat
		 */
		readonly first_name: string;

		/**
		 * Last name of the other party in a private chat
		 */
		readonly last_name: string;

		/**
		 * True, if the supergroup chat is a forum (has topics enabled)
		 */
		readonly is_forum?: true;
	}

	export type MessageId = number;

	/**
	 * https://core.telegram.org/bots/api#callbackquery
	 */
	export interface CallbackQuery {
		/**
		 * Unique identifier for this query
		 */
		readonly id: string;

		/**
		 * Sender
		 */
		readonly from: User;

		/**
		 * Message sent by the bot with the callback button
		 * that originated the query
		 */
		readonly message?: MaybeInaccessibleMessage;

		/**
		 * Identifier of the message sent via the bot in inline mode,
		 * that originated the query.
		 */
		readonly inline_message_id?: string;

		/**
		 * Global identifier, uniquely corresponding to the chat
		 * to which the message with the callback button was sent.
		 * Useful for high scores in games.
		 */
		readonly chat_instance: string;

		/**
		 * Data associated with the callback button.
		 * Be aware that the message originated the query
		 * can contain no callback buttons with this data.
		 */
		readonly data?: string;

		/**
		 * Short name of a Game to be returned, 
		 * serves as the unique identifier for the game
		 */
		readonly game_short_name?: string;
	}

	/**
	 * https://core.telegram.org/bots/api#inlinekeyboardbutton
	 */
	export interface InlineKeyboardButton {
		/**
		 * Label text on the button
		 */
		readonly text: string;

		/**
		 * HTTP or tg:// URL to be opened when the button is pressed.
		 * Links tg://user?id=<user_id> can be used to mention a user 
		 * by their identifier without using a username,
		 * if this is allowed by their privacy settings.
		 */
		readonly url?: URL;

		/**
		 * Data to be sent in a `CallbackQuery` to the bot when 
		 * the button is pressed, 1-64 bytes
		 */
		readonly callback_data?: string;
	}

	/**
	 * https://core.telegram.org/bots/api#inlinekeyboardmarkup
	 */
	export interface InlineKeyboardMarkup {
		readonly inline_keyboard: ReadonlyArray<ReadonlyArray<InlineKeyboardButton>>;
	}

	/**
	 * https://core.telegram.org/bots/api#keyboardbutton
	 */
	export interface KeyboardButton {
		/**
		 * Text of the button. If none of the optional fields are used,
		 * it will be sent as a message when the button is pressed
		 */
		readonly text: string;

		/**
		 * If specified, pressing the button will open a list of suitable users.
		 * Identifiers of selected users will be sent to the bot in
		 * a “users_shared” service message. Available in private chats only.
		 */
		readonly request_users?: KeyboardButtonRequestUsers;

		/**
		 * If specified, pressing the button will open a list of suitable chats.
		 * Tapping on a chat will send its identifier to the bot in 
		 * a “chat_shared” service message. Available in private chats only.
		 */
		readonly request_chat?: KeyboardButtonRequestChat;

		/**
		 * If True, the user's phone number will be sent as a contact when 
		 * the button is pressed. Available in private chats only.
		 */
		readonly request_contact?: boolean;

		/**
		 * If True, the user's current location will be sent when
		 * the button is pressed. Available in private chats only.
		 */
		readonly request_location?: boolean;

		/**
		 * If specified, the user will be asked to create a poll and send it
		 * to the bot when the button is pressed.Available in private chats only.
		 */
		readonly request_poll?: KeyboardButtonPollType;

		/**
		 * If specified, the described Web App will be launched when 
		 * the button is pressed.The Web App will be able to send 
		 * a “web_app_data” service message.Available in private chats only.
		 */
		readonly web_app?: WebAppInfo;
	}

	export type KeyboardButtonPollType = never; // Not implemented yet

	export type KeyboardButtonRequestChat = never; // Not implemented yet

	export type KeyboardButtonRequestUsers = never; // Not implemented yet

	export type MaybeInaccessibleMessage = unknown; // Not implemented yet

	/**
	 * @see https://core.telegram.org/bots/api#replykeyboardmarkup
	 */
	export interface ReplyKeyboardMarkup {
		/**
		 * Array of button rows, each represented by an Array of KeyboardButton objects
		 */
		readonly keyboard: Array<Array<KeyboardButton>>;

		/**
		 * Requests clients to always show the keyboard when the regular
		 * keyboard is hidden. Defaults to false, in which case the custom
		 * keyboard can be hidden and opened with a keyboard icon.
		 * 
		 * @default false
		 */
		readonly is_persistent?: boolean;

		/**
		 * Requests clients to resize the keyboard vertically for optimal 
		 * fit (e.g., make the keyboard smaller if there are just two 
		 * rows of buttons). Defaults to false, in which case the custom
		 * keyboard is always of the same height as the app's standard keyboard.
		 * 
		 * @default false
		 */
		readonly resize_keyboard?: boolean;

		/**
		 * Requests clients to hide the keyboard as soon as it's been used.
		 * The keyboard will still be available, but clients will automatically
		 * display the usual letter-keyboard in the chat - the user can press
		 * a special button in the input field to see the custom keyboard again.
		 * 
		 * @default false
		 */
		readonly one_time_keyboard?: boolean;

		/**
		 *  The placeholder to be shown in the input field when the keyboard is active; 1-64 characters
		 */
		readonly input_field_placeholder?: string;

		/**
		 * Use this parameter if you want to show the keyboard to specific users only.
		 * 
		 * Targets:
		 * 1. users that are \@mentioned in the text of the Message object;
		 * 2. if the bot's message is a reply to a message in the same chat and 
		 *    forum topic, sender of the original message.
		 */
		readonly selective?: boolean;

	}

	/**
	 * Upon receiving a message with this object, Telegram clients will remove
	 * the current custom keyboard and display the default letter-keyboard.
	 * 
	 * By default, custom keyboards are displayed until a new keyboard
	 * is sent by a bot.
	 * 
	 * An exception is made for one-time keyboards that are hidden
	 * immediately after the user presses a button.
	 * 
	 * @see https://core.telegram.org/bots/api#replykeyboardremove
	 */
	export interface ReplyKeyboardRemove {
		/**
		 * Requests clients to remove the custom keyboard (user will not be able
		 * to summon this keyboard; if you want to hide the keyboard from sight
		 * but keep it accessible, use one_time_keyboard in ReplyKeyboardMarkup)
		 */
		readonly remove_keyboard: true;

		/**
		 * Use this parameter if you want to remove the keyboard
		 * for specific users only. 
		 * 
		 * Targets:
		 * 1. users that are @mentioned in the text of the Message object
		 * 2. if the bot's message is a reply to a message in the same chat 
		 *    and forum topic, sender of the original message.
		 */
		readonly selective?: boolean;
	}

	/**
	 * This object represents a message.
	 * 
	 * https://core.telegram.org/bots/api#message
	 */
	export interface Message {
		/**
		 * Unique message identifier inside this chat
		 */
		readonly message_id: MessageId;

		/**
		 * Chat the message belongs to
		 */
		readonly chat: Chat;

		/**
		 * Sender of the message; may be empty for messages sent to channels.
		 * For backward compatibility, if the message was sent on behalf of
		 * a chat, the field contains a fake sender user in non-channel chats
		 */
		readonly from: User;

		/**
		 * Date the message was sent in Unix time. It is always
		 * a positive number, representing a valid date.
		 */
		readonly date: number;

		/**
		 * For text messages, the actual UTF-8 text of the message
		 */
		readonly text: string;
	}

	/**
	 * https://core.telegram.org/bots/api#update
	 */
	export interface Update {
		/**
		 * The update's unique identifier. Update identifiers start from a certain positive number and increase sequentially.
		 * This ID becomes especially handy if you're using Webhooks, since it allows you to ignore repeated updates
		 * or to restore the correct update sequence, should they get out of order. If there are no new updates for at least a week,
		 * then identifier of the next update will be chosen randomly instead of sequentially.
		 */
		readonly update_id: number;

		// New incoming message of any kind — text, photo, sticker, etc.
		readonly message?: Message;

		// edited_message	Message	Optional. New version of a message that is known to the bot and was edited
		// channel_post	Message	Optional. New incoming channel post of any kind — text, photo, sticker, etc.
		// edited_channel_post	Message	Optional. New version of a channel post that is known to the bot and was edited
		// inline_query	InlineQuery	Optional. New incoming inline query

		// chosen_inline_result	ChosenInlineResult	Optional. The result of an inline query that was chosen by a user
		//and sent to their chat partner. Please see our documentation on the feedback collecting for details on how
		//to enable these updates for your bot.

		/**
		 * New incoming callback query
		 */
		readonly callback_query?: CallbackQuery;

		// shipping_query	ShippingQuery	Optional. New incoming shipping query. Only for invoices with flexible price
		// pre_checkout_query	PreCheckoutQuery	Optional. New incoming pre-checkout query. Contains full information about checkout
		// poll	Poll	Optional. New poll state. Bots receive only updates about stopped polls and polls, which are sent by the bot
		// poll_answer	PollAnswer	Optional. A user changed their answer in a non-anonymous poll. Bots receive new votes only
		//in polls that were sent by the bot itself.
	}

	/**
	 * This object represents a Telegram user or bot.
	 * 
	 * @see https://core.telegram.org/bots/api#user
	 */
	export interface User {
		/**
		 * Unique identifier for this user or bot.
		 * This number may have more than 32 significant bits and some
		 * programming languages may have difficulty/silent
		 * defects in interpreting it. But it has at most 52 significant bits,
		 * so a 64-bit integer or double-precision float type are safe
		 * for storing this identifier.
		 */
		readonly id: number;

		/**
		 * User's or bot's username
		 */
		readonly username?: string;

		// TBD next
	}

	export type WebAppInfo = never; // Not implemented yet
}

class ChatToken {
	private _chatId: number;

	public static parse(chatToken: string): ChatToken {
		const chatTokenData = JSON.parse(chatToken);

		// TOD validate chatTokenData

		return new ChatToken(chatTokenData.chat_id);
	}

	public constructor(chatId: number) {
		this._chatId = chatId;
	}

	public get chatId(): number { return this._chatId; }

	public toString(): string {
		return this.toJSON();
	}

	public toJSON(): string {
		return JSON.stringify({ chat_id: this._chatId });
	}
}


class MessengerApprovementImpl extends MessengerApprovement {
	private readonly _chatTopics: Map<
		TelegramApiClientInternal.ChatId,
		Settings.Messenger.Common.ApprovementBinding["bindTopic"]
	>;

	public constructor(
		private readonly _configuration: TelegramMessenger.Configuration,
		private readonly _telegram: TelegramApiClient,
		private readonly _messenger: TelegramMessenger,
		private readonly _logger: FLogger,
	) {
		super();

		this._chatTopics = new Map();
		for (const approvementTopicBinding of _configuration.approvementBindings.values()) {
			this._chatTopics.set(approvementTopicBinding.chatId, approvementTopicBinding.bindTopic);
		}
	}

	protected override get configuration(): Messenger.Configuration { return this._configuration; }

	private findChatTopic(chat_id: TelegramApiClientInternal.ChatId): Settings.Messenger.Common.ApprovementBinding["bindTopic"] | null {
		const topicName = this._chatTopics.get(chat_id);
		if (topicName !== undefined) { return topicName; }
		return null;
	}

	public override async closeAsApprove(executionContext: FExecutionContext, approvementId: ApprovementId, approvers: ReadonlyArray<Approver>): Promise<void> {
		// return this._messenger.approvementCloseAsApprove(executionContext, approvementId, approvers);


		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._messenger.kvDb.get(
			executionContext,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new FExceptionArgument(
				`Messenger '${this._messenger.name}' does not have related topic to approvementId: '${approvementId}'.`,
				"approvementId"
			);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvements.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new FExceptionInvalidOperation(
				`Wrong operation. Messenger '${this._messenger.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._messenger.kvDb
			.get(executionContext, this.formatKey__messageContent_by_approvementId(approvementId));

		const approverNames: Array<string> = approvers
			.filter((approver: Approver): approver is Approver.Telegram => approver.source === "telegram")
			.map(approver => `@${approver.username}`);

		const approvedMessageContent: string = approverNames.length > 0
			? (
				messageContent.endsWith("\n")
					? `${messageContent}<i>Approved by: </i>${approverNames.join(" ")}`
					: `${messageContent}\n<i>Approved by: </i>${approverNames.join(" ")}`
			)
			: messageContent;

		await this._telegram.editMessageText(executionContext, {
			chat_id, message_id,
			text: approvedMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	public override async closeAsExpired(executionContext: FExecutionContext, approvementId: ApprovementId): Promise<void> {
		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._messenger.kvDb.get(
			executionContext,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new FExceptionArgument(
				`Messenger '${this._messenger.name}' does not have related topic to approvementId: '${approvementId}'.`,
				"approvementId"
			);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvements.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new FExceptionInvalidOperation(
				`Wrong operation. Messenger '${this._messenger.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._messenger.kvDb
			.get(executionContext, this.formatKey__messageContent_by_approvementId(approvementId));

		const expiredMessageContent: string = messageContent.endsWith("\n") ? `${messageContent}<i>Expired</i>` : `${messageContent}\n<i>Expired</i>`;

		await this._telegram.editMessageText(executionContext, {
			chat_id, message_id,
			text: expiredMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	public override async closeAsRefuse(executionContext: FExecutionContext, approvementId: ApprovementId, refuser: Approver): Promise<void> {
		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._messenger.kvDb.get(
			executionContext,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new FExceptionArgument(
				`Messenger '${this._messenger.name}' does not have related topic to approvementId: '${approvementId}'.`,
				"approvementId"
			);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvements.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new FExceptionInvalidOperation(
				`Wrong operation. Messenger '${this._messenger.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._messenger.kvDb
			.get(executionContext, this.formatKey__messageContent_by_approvementId(approvementId));

		const refusedMessageContent: string = refuser.source === "telegram"
			? (
				messageContent.endsWith("\n")
					? `${messageContent}<i>Refused by: </i>@${refuser.username}`
					: `${messageContent}\n<i>Refused by: </i>@${refuser.username}`
			)
			: messageContent;

		await this._telegram.editMessageText(executionContext, {
			chat_id, message_id,
			text: refusedMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	/**
	 * @inheritdoc
	 */
	public override async create(
		executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<Messenger.ApprovementMessageToken> {
		// this.verifyInitializedAndNotDisposed();

		const approvementTopicBinding: Settings.Messenger.Telegram.ApprovementBinding | undefined
			= this._configuration.approvementBindings.get(approvementTopicName);

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvements.get(approvementTopicName);

		if (approvementTopicBinding === undefined || approvementTopic === undefined) {
			throw new FExceptionInvalidOperation(
				`Wrong operation. Messenger '${this._messenger.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = MessengerApprovement.renderMessageContent(approvementTopicBinding.renderTemplate, renderData);

		await FUsing(executionContext, () => this._messenger.kvDb.transaction(executionContext), async (__, db) => {
			const key: KeyValueDb.Key = this.formatKey__messageContent_by_approvementId(approvementId);
			const duplicateMessageContent: KeyValueDb.Value | null = await db.find(executionContext, key);
			if (duplicateMessageContent !== null) {
				throw new FExceptionInvalidOperation(`Duplicate approvementId: '${approvementId}'.`);
			}
			await db.set(executionContext, key, messageContent);
			await db.commit(executionContext);
		});

		const message: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			chat_id: approvementTopicBinding.chatId,
			text: messageContent,
			parse_mode: "HTML",
			disable_notification: true,
			disable_web_page_preview: true,
			reply_markup: {
				inline_keyboard: MessengerApprovementImpl.formatInlineKeyboard(approvementTopic.requireVotes, 0)
			}
		});

		const approvementMessageToken: Messenger.ApprovementMessageToken = JSON.stringify({
			chat_id: approvementTopicBinding.chatId,
			message_id: message.message_id
		});

		await FUsing(executionContext, () => this._messenger.kvDb.transaction(executionContext), async (__, db) => {
			await db.set(
				executionContext,
				this.formatKey__approvementMessageToken_by_approvementId(approvementId),
				approvementMessageToken
			);
			await db.set(
				executionContext,
				this.formatKey__approvementId_by_approvementMessageToken(approvementMessageToken),
				`${approvementId}`
			);
			await db.commit(executionContext);
		});

		return approvementMessageToken;
	}

	public async tryHandleUpdateCallbackQuery(
		executionContext: FExecutionContext,
		query: TelegramApiClientInternal.CallbackQuery,
	): Promise<boolean> {
		// TODO validate data
		const message = query.message as any;
		const chat_id: string = message.chat.id.toString();

		const topicName = this.findChatTopic(chat_id);
		if (topicName === null) {
			this._logger.debug(
				executionContext,
				() => `Skip CallbackQuery update due related topic was not found by chat_id: ${chat_id}`
			);
			return false;
		}
		const bindingConfiguration = this._configuration.approvementBindings.get(topicName);
		if (bindingConfiguration === undefined) {
			this._logger.debug(
				executionContext,
				() => `Skip CallbackQuery update due related bindingConfiguration was not found by topicName: ${topicName}`
			);
			return false;
		}

		// TODO validate data
		const answerData: string = query.data as string;

		// TODO validate data
		// const chat_title: string = message.chat.title.toString();
		const chat_type: string = message.chat.type.toString();
		const message_id: number = message.message_id;
		const message_date_unix: number = message.date;
		const username: string = (query.from as any).username;

		const approvementMessageToken: Messenger.ApprovementMessageToken = JSON.stringify({
			chat_id: chat_id,
			message_id: message_id
		});

		const approvementId: ApprovementId | null = await this._messenger.kvDb
			.find(executionContext, this.formatKey__approvementId_by_approvementMessageToken(approvementMessageToken));
		if (approvementId === null) {
			this._logger.debug(
				executionContext,
				() => `Skip CallbackQuery update due related approvementId was not found by chat_id: ${chat_id} and message_id: ${message_id}`
			);
			return false;
		}

		const approver: Approver = new TelegramMessengerInternal.ApproverImpl(
			username,
			chat_id,
			// chat_title,
			chat_type, message_id,
			new Date(message_date_unix * 1000),
		);
		if (answerData === TelegramApiClientInternal.ApprovementVote.APPROVE) {
			await this.notify(
				executionContext,
				Object.freeze({
					messenger: this._messenger,
					data: Object.freeze({
						approvementId,
						approver,
						decision: MessengerApprovement.Decision.APPROVE,
					}),
				}),
			);
		} else if (answerData === TelegramApiClientInternal.ApprovementVote.REFUSE) {
			await this.notify(
				executionContext,
				Object.freeze({
					messenger: this._messenger,
					data: Object.freeze({
						approvementId,
						approver,
						decision: MessengerApprovement.Decision.REFUSE,
					}),
				}),
			);
		} else {
			throw new FExceptionInvalidOperation(`Unexpected answer data '${answerData}'.`);
		}

		return true;
	}

	public async tryHandleUpdateMessage(
		executionContext: FExecutionContext,
		message: TelegramApiClientInternal.Message,
	): Promise<boolean> {
		return false;
	}

	public override async update(executionContext: FExecutionContext, approvementId: ApprovementId, approvers: ReadonlyArray<Approver>): Promise<void> {

		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._messenger.kvDb.get(
			executionContext,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new FExceptionArgument(
				`Messenger '${this._messenger.name}' does not have related topic to approvementId: '${approvementId}'.`,
				"approvementId"
			);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvements.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new FExceptionInvalidOperation(
				`Wrong operation. Messenger '${this._messenger.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		await this._telegram.editMessageReplyMarkup(executionContext, {
			chat_id, message_id,
			reply_markup: {
				inline_keyboard: MessengerApprovementImpl.formatInlineKeyboard(approvementTopic.requireVotes, approvers.length)
			}
		});
	}

	private static formatInlineKeyboard(requireVotes: number, approvedVotes: number) {
		if (requireVotes < 0) {
			throw new FExceptionArgument(
				"Value should be positive of zero.",
				"requireVotes",
			);
		}
		if (approvedVotes < 0) {
			throw new FExceptionArgument(
				"Value should be positive of zero.",
				"approvedVotes",
			);
		}
		return Object.freeze([
			Object.freeze([
				Object.freeze({
					text: `Approve (${approvedVotes}/${requireVotes})`,
					callback_data: TelegramApiClientInternal.ApprovementVote.APPROVE
				}),
				Object.freeze({
					text: "Refuse",
					callback_data: TelegramApiClientInternal.ApprovementVote.REFUSE
				})
			])
		]);
	}

	private formatKey__messageContent_by_approvementId(approvementId: ApprovementId) {
		return `${this._messenger.name}:messageContent_by_approvementId(${approvementId})`;
	}

	private formatKey__approvementMessageToken_by_approvementId(approvementId: ApprovementId) {
		return `${this._messenger.name}:approvementMessageToken_by_approvementId(${approvementId})`;
	}

	private formatKey__approvementId_by_approvementMessageToken(approvementMessageToken: Messenger.ApprovementMessageToken) {
		return `${this._messenger.name}:approvementId_by_approvementMessageToken(${approvementMessageToken})`;
	}
}

class MessengerDialogImpl extends MessengerDialog {
	public constructor(
		private readonly _configuration: TelegramMessenger.Configuration,
		private readonly _telegram: TelegramApiClient,
		private readonly _messenger: TelegramMessenger,
		private readonly _logger: FLogger,
	) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	public override async choose(
		executionContext: FExecutionContext,
		dialogId: DialogIdentifier,
		chatToken: string,
		chooseVariants: MessengerDialogChooseVariantGroup,
		startDialogMessage: string,
	): Promise<void> {
		const { chatId: chat_id } = ChatToken.parse(chatToken);

		const keyboard: Array<Array<TelegramApiClientInternal.KeyboardButton>> = [];
		{ // local scope
			function recursiveKeyboardButtonFiller(
				recursiveItem: MessengerDialogChooseVariant,
				targetKeyboard: Array<TelegramApiClientInternal.KeyboardButton>,
			) {
				if (recursiveItem instanceof MessengerDialogChooseVariantGroup) {
					for (const child of recursiveItem.children) {
						recursiveKeyboardButtonFiller(child, targetKeyboard);
					}
				} else if (recursiveItem instanceof MessengerDialogChooseVariantText) {
					targetKeyboard.push({
						text: recursiveItem.text,
					})
				} else {
					throw new FExceptionInvalidOperation(`Unsupported MessengerDialogChooseVariant implementation: ${recursiveItem.constructor.name}`);
				}
			}
			for (const firstLevelGroup of chooseVariants.children) {
				const targetKeyboard: Array<TelegramApiClientInternal.KeyboardButton> = [];
				keyboard.push(targetKeyboard);
				if (firstLevelGroup instanceof MessengerDialogChooseVariantGroup) {
					for (const secondLevelGroup of firstLevelGroup.children) {
						recursiveKeyboardButtonFiller(secondLevelGroup, targetKeyboard);
					}
				} else {
					recursiveKeyboardButtonFiller(firstLevelGroup, targetKeyboard);
				}
			}
		}

		const controlMessage: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			chat_id,
			text: startDialogMessage,
			parse_mode: "HTML",
			disable_notification: true,
			disable_web_page_preview: true,
			reply_markup: {
				// inline_keyboard: TelegramMessenger.formatInlineKeyboard(approvementTopic.requireVotes, 0)
				keyboard
				// : [
				// 	[
				// 		{
				// 			text: "Ololo1",
				// 		},
				// 		{
				// 			text: "Ololo2",
				// 		},
				// 	],
				// 	[
				// 		{
				// 			text: "Ololo3",
				// 		},
				// 		{
				// 			text: "Ololo4",
				// 		},
				// 	],
				// ]
			}
		});

		console.log(controlMessage);
	}

	/**
	 * @inheritdoc
	 */
	public override async reset(
		executionContext: FExecutionContext,
		dialogId: DialogIdentifier,
		chatToken: string,
		endDialogMessage: string,
	): Promise<void> {
		const { chatId: chat_id } = ChatToken.parse(chatToken);

		const controlMessage: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			chat_id,
			text: endDialogMessage,
			parse_mode: "HTML",
			disable_notification: true,
			disable_web_page_preview: true,
			reply_markup: {
				remove_keyboard: true,
			}
		});

		console.log(controlMessage);
	}

	/**
	 * @inheritdoc
	 */
	public override async message(
		executionContext: FExecutionContext,
		chatToken: string,
		message: string,
	): Promise<void> {
		const { chatId: chat_id } = ChatToken.parse(chatToken);

		const controlMessage: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			chat_id,
			text: message,
			parse_mode: "HTML",
			disable_notification: true,
			disable_web_page_preview: true,
		});

		console.log(controlMessage);
	}

	/**
	 * @inheritdoc
	 */
	public override async setPendingStatus(
		executionContext: FExecutionContext,
		chatToken: string,
	): Promise<void> {
		const { chatId: chat_id } = ChatToken.parse(chatToken);

		await this._telegram.sendChatAction(executionContext, {
			chat_id,
			action: "typing",
		});
	}

	public async tryHandleUpdateCallbackQuery(
		executionContext: FExecutionContext,
		query: TelegramApiClientInternal.CallbackQuery,
	): Promise<boolean> {
		return false;
	}

	public async tryHandleUpdateMessage(
		executionContext: FExecutionContext,
		message: TelegramApiClientInternal.Message,
	): Promise<boolean> {

		const { chat, text } = message;
		const chatToken = new ChatToken(message.chat.id);

		if (chat.type === "private") {
			await this.notify(
				executionContext,
				Object.freeze({
					messenger: this._messenger,
					chatToken: chatToken.toString(),
					data: {
						// dialogId: null,
						text,
					},
				})
			);

			return true;

			// if (text.startsWith("Ololo")) {
			// 	const controlMessage: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			// 		chat_id: message.chat.id,
			// 		text: "<i>Bye-bye</i>",
			// 		parse_mode: "HTML",
			// 		disable_notification: true,
			// 		disable_web_page_preview: true,
			// 		reply_markup: {
			// 			remove_keyboard: true,
			// 		}
			// 	});

			// 	console.log(controlMessage);

			// } else {

			// 	const controlMessage: TelegramApiClientInternal.Message = await this._telegram.sendMessage(executionContext, {
			// 		chat_id: message.chat.id,
			// 		text: "<b>Test</b><i>Test</i>",
			// 		parse_mode: "HTML",
			// 		disable_notification: true,
			// 		disable_web_page_preview: true,
			// 		reply_markup: {
			// 			// inline_keyboard: TelegramMessenger.formatInlineKeyboard(approvementTopic.requireVotes, 0)
			// 			keyboard: [
			// 				[
			// 					{
			// 						text: "Ololo1",
			// 					},
			// 					{
			// 						text: "Ololo2",
			// 					},
			// 				],
			// 				[
			// 					{
			// 						text: "Ololo3",
			// 					},
			// 					{
			// 						text: "Ololo4",
			// 					},
			// 				],
			// 			]
			// 		}
			// 	});

			// 	console.log(controlMessage);
			// }
		}

		return false;
	}
}
