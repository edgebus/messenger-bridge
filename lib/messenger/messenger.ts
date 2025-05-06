import {
	FChannelEvent,
	FChannelEventBase,
	FChannelEventMixin,
	FExceptionInvalidOperation,
	FExecutionContext,
	FInitableBase,
} from "@freemework/common";

//
// import { render } from "mustache";
// ^^^^^^
// SyntaxError: The requested module 'mustache' does not provide an export named 'render'
//import { render } from "mustache";
//
// Workaround
import mustache from "mustache";
const { render } = mustache;

import { Settings } from "../settings.js";

import { KeyValueDb } from "../database/memory/memory.database.js";
import {
	ApprovementId,
	ApprovementTopicName,
	Approver,
	ApprovementTopic,
	DialogIdentifier
} from "../model/index.js";

import { MessengerDialogChooseVariantGroup } from "./messenger_dialog.js";
/**
 * TBD
 */
export abstract class MessengerApprovement
	extends FChannelEventBase<MessengerApprovement.EventArgs, MessengerApprovement.Event>
	implements FChannelEvent<MessengerApprovement.EventArgs, MessengerApprovement.Event> {

	protected abstract get configuration(): Messenger.Configuration;

	protected static renderMessageContent(mustacheRenderTemplate: string, renderData: any): string {
		const mustacheDataContext = new Proxy(renderData, {
			get(__, property) {
				if (typeof property === "string") {
					if (property in renderData) {
						return renderData[property];
					}
					throw new FExceptionInvalidOperation(`Non-existing property '${property}'.`);
				}
			}
		});

		const messageContent: string = render(mustacheRenderTemplate, mustacheDataContext);
		// const messageContent: string = "tbd";
		return messageContent;
	}

	public isBoundToApprovementTopic(approvementTopicName: ApprovementTopicName): boolean {
		return this.configuration.approvementBindings.has(approvementTopicName);
	}

	/**
	 * Edit Approvement message to show approved state
	 * 
	 * @param approvementId An identifier of approvement
	 */
	public abstract closeAsApprove(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	/**
	 * Edit Approvement message to show expired state
	 * 
	 * @param approvementId An identifier of approvement
	 */
	public abstract closeAsExpired(
		executionContext: FExecutionContext,
		approvementId: ApprovementId
	): Promise<void>;

	/**
	 * Edit Approvement message to show refuse state
	 * 
	 * @param approvementId An identifier of approvement
	 */
	public abstract closeAsRefuse(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		refuser: Approver
	): Promise<void>;


	public abstract create(
		executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<Messenger.ApprovementMessageToken>;

	/**
	 * Edit Approvement message to show actual list of approvers
	 * 
	 * @param approvementId An identifier of approvement
	 * @param approvers List of approvers
	 */
	public abstract update(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;
}
export namespace MessengerApprovement {
	export const enum Decision {
		APPROVE = "APPROVE",
		REFUSE = "REFUSE",
	}

	export interface EventArgs {
		readonly approvementId: ApprovementId;
		readonly approver: Approver;
		readonly decision: Decision;
	}
	export interface Event extends FChannelEvent.Event<EventArgs> {
		readonly messenger: Messenger;
	}

	export type Callback = FChannelEvent.Callback<EventArgs, Event>;
}

export abstract class MessengerDialog
	extends FChannelEventBase<MessengerDialog.EventArgs, MessengerDialog.Event>
	implements FChannelEvent<MessengerDialog.EventArgs, MessengerDialog.Event> {

	/**
	 * Use choose dialog
	 */
	public abstract choose(
		executionContext: FExecutionContext,
		dialogId: DialogIdentifier,
		chatToken: string,
		chooseVariants: MessengerDialogChooseVariantGroup,
		startDialogMessage: string,
	): Promise<void>;

	/**
	 * Sent dialog message
	 */
	public abstract message(
		executionContext: FExecutionContext,
		chatToken: string,
		message: string,
	): Promise<void>;

	/**
	 * Sent(set) dialog pending status (like a bot is typing, please wait...)
	 */
	public abstract setPendingStatus(
		executionContext: FExecutionContext,
		chatToken: string,
		// TODO kind: PendingStatusKind,
	): Promise<void>;

	/**
	 * Reset dialog (remove all buttons, commands, etc)
	 */
	public abstract reset(
		executionContext: FExecutionContext,
		dialogId: DialogIdentifier,
		chatToken: string,
		endDialogMessage: string,
	): Promise<void>
}
export namespace MessengerDialog {
	export interface EventArgs {
		// readonly dialogId: DialogIdentifier;
		readonly text: string;
	}
	export interface Event extends FChannelEvent.Event<EventArgs> {
		readonly messenger: Messenger;
		readonly chatToken: string;
	}

	export type Callback = FChannelEvent.Callback<EventArgs, Event>;

	// export interface WorkflowEvent extends FChannelEvent.Event<string> {
	// 	readonly messenger: Messenger;
	// 	readonly chatToken: string;
	// }
	// export type WorkflowEventChannel = FChannelEvent<string, WorkflowEvent>;
}

export abstract class Messenger extends FInitableBase {
	// protected readonly _workflowEventChannel: WorkflowEventChannelSink;
	protected readonly _configuration: Messenger.Configuration;
	protected readonly _kvDb: KeyValueDb;

	public abstract get approvement(): MessengerApprovement;
	public abstract get dialog(): MessengerDialog;

	public get name(): string { return this.name; }
	// public get workflowEventChannel(): Messenger.WorkflowEventChannel { return this._workflowEventChannel; }

	protected constructor(configuration: Messenger.Configuration, kvDb: KeyValueDb) {
		super();
		this._configuration = configuration;
		this._kvDb = kvDb;
		// this._workflowEventChannel = new WorkflowEventChannelSink();
	}
}
export namespace Messenger {
	export type ApprovementMessageToken = string;

	// tslint:disable-next-line: no-shadowed-variable
	export interface Configuration extends Settings.Messenger.Common {
		readonly approvements: ReadonlyMap<ApprovementTopicName, ApprovementTopic>;
	}
}

// class WorkflowEventChannelSink implements Messenger.WorkflowEventChannel {
// 	public async emit(
// 		executionContext: FExecutionContext,
// 		messenger: Messenger,
// 		chatToken: string,
// 		data: string
// 	): Promise<void> {
// 		await this.notify(executionContext, Object.freeze({ messenger, chatToken, data }));
// 	}
// }
// interface WorkflowEventChannelSink extends FChannelEventMixin<string, Messenger.WorkflowEvent> { }
// FChannelEventMixin.applyMixin(WorkflowEventChannelSink);

