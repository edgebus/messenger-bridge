import {
	FChannelEvent,
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

import { ApprovementId, ApprovementTopicName } from "../model/primitives.js";
import { KeyValueDb } from "../misc/key_value_db.js";
import { ApprovementTopic } from "../model/approvement_topic.js";
import { Approver } from "../model/approver.js";

export abstract class BaseMessenger extends FInitableBase {
	protected readonly _approveEventChannel: ApprovementEventChannelSink;
	protected readonly _refuseEventChannel: ApprovementEventChannelSink;
	protected readonly _configuration: BaseMessenger.Configuration;
	protected readonly _kvDb: KeyValueDb;

	public get approveEventChannel(): BaseMessenger.ApprovementEventChannel { return this._approveEventChannel; }
	public get name(): string { return this.name; }
	public get refuseEventChannel(): BaseMessenger.ApprovementEventChannel { return this._refuseEventChannel; }

	public isBoundToApprovementTopic(approvementTopicName: ApprovementTopicName): boolean {
		return this._configuration.approvementTopicBindings.has(approvementTopicName);
	}

	public abstract closeApprovementAsApprove(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	public abstract closeApprovementAsExpired(
		executionContext: FExecutionContext,
		approvementId: ApprovementId
	): Promise<void>;

	public abstract closeApprovementAsRefuse(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		refuser: Approver
	): Promise<void>;

	public abstract registerApprovement(
		executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<BaseMessenger.ApprovementMessageToken>;

	public abstract updateApprovement(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	protected constructor(configuration: BaseMessenger.Configuration, kvDb: KeyValueDb) {
		super();
		this._configuration = configuration;
		this._kvDb = kvDb;
		this._approveEventChannel = new ApprovementEventChannelSink();
		this._refuseEventChannel = new ApprovementEventChannelSink();
	}

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

}

export namespace BaseMessenger {
	export type ApprovementMessageToken = string;

	// tslint:disable-next-line: no-shadowed-variable
	export interface Configuration extends Settings.Messenger.Common {
		readonly approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	}


	export interface ApprovementEvent extends FChannelEvent.Event<Approver> {
		readonly sender: BaseMessenger;
		readonly approvementId: ApprovementId;
	}
	export type ApprovementEventChannel = FChannelEvent<Approver, ApprovementEvent>;

}

class ApprovementEventChannelSink implements BaseMessenger.ApprovementEventChannel {
	public async emit(
		executionContext: FExecutionContext,
		sender: BaseMessenger,
		approvementId: ApprovementId,
		data: Approver
	): Promise<void> {
		await this.notify(executionContext, Object.freeze({ sender, approvementId, data }));
	}
}
interface ApprovementEventChannelSink extends FChannelEventMixin<Approver, BaseMessenger.ApprovementEvent> { }
FChannelEventMixin.applyMixin(ApprovementEventChannelSink);

