import { Dialog } from "./dialog.js";
import { DialogMessageIdentifier } from "./identifiers.js";

export namespace DialogMessage {
	export interface Id {
		dialogMessageId: DialogMessageIdentifier;
	}

	export namespace Data {
		export interface _Base extends Dialog.Id {
			readonly dialogMessageText: string;
		}
	}
	export type Data = Data._Base;

	export interface Instance {
		readonly dialogMessageCreatedAt: Date;
		readonly dialogMessageProcessedAt: Date | null;
	}
}
export type DialogMessage =
	& DialogMessage.Id
	& DialogMessage.Data
	& DialogMessage.Instance
	;
