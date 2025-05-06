import { Workflow } from "../2nd/workflow/workflow_model.js";
import { DialogIdentifier } from "./identifiers.js";

export namespace Dialog {
	export interface Id {
		dialogId: DialogIdentifier;
	}

	export interface MessengerChatToken {
		dialogMessengerChatToken: string;
	}

	export namespace Data {
		export interface _Base extends MessengerChatToken, Workflow.Id {
			readonly dialogMessengerType: string;
			readonly dialogMessengerName: string;
		}
		export interface Slack extends _Base {
			readonly dialogMessengerType: "slack";
			// TBD
		}
		export interface Telegram extends _Base {
			readonly dialogMessengerType: "telegram";
			// TBD
		}
		export interface Viber extends _Base {
			readonly dialogMessengerType: "viber";
			// TBD
		}
	}
	export type Data = Data.Slack | Data.Telegram | Data.Viber;

	export interface Instance {
		readonly dialogCreatedAt: Date;
	}
}
export type Dialog =
	& Dialog.Id
	& Dialog.Data
	& Dialog.Instance
	;
