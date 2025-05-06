import {
	FException,
	FExceptionInvalidOperation,
	FExecutionContext,
	FSleep,
} from "@freemework/common";

import {
	Activity,
	BusinessActivity,
	DataContextActivity,
	DelayActivity,
	IfActivity,
	NativeActivity,
	SequenceActivity,
	TryCatchActivity,
} from "../../2nd/workflow/index.js";
import {
	WorkflowVirtualMachineExecutionContext,
	WorkflowVirtualMachineNativeExecutionContext,
} from "../../2nd/workflow/WorkflowVirtualMachine.js";
import { } from "@freemework/common";
import { DatabaseFactory } from "../../database/index.js";
import { Messenger, MessengerDialogChooseVariant, MessengerDialogChooseVariantGroup, MessengerDialogChooseVariantText } from "../../messenger/index.js";
import { SingletonProviderExecutionContext } from "../../utils/singleton_provider_execution_context.js";
import { MessengerService } from "../../service/messenger.service.js";
import { DialogIdentifier } from "../../model/identifiers.js";
import { DialogMessage } from "../../model/index.js";
import { LoggerActivity, NopActivity } from "../../2nd/workflow/activities/index.js";

/**
 * 
 */
export abstract class MessengerDialogMessageActivity extends NativeActivity { }

abstract class MessengerDialogChooseItemActivity extends NativeActivity { }
abstract class MessengerDialogChooseVariantActivity extends MessengerDialogChooseItemActivity { }
class MessengerDialogChooseVariantGroupActivity extends MessengerDialogChooseVariantActivity {
	public constructor(opts: {
		readonly children: ReadonlyArray<MessengerDialogChooseVariantActivity>;
	}) {
		super(...opts.children);
	}

	protected async onExecute(executionContext: FExecutionContext): Promise<void> {
		this._logger.trace(executionContext, "Enter");
		try {
			const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

			// const childIndex: number = vmContext.callCounter - 1;
			// if (childIndex < this.children.length) {
			// 	await vmContext.stackPush(executionContext, childIndex);
			// } else {
			// 	vmContext.stackPop(); // remove itself
			// }

			await FSleep(executionContext, 1000);
		} finally {
			this._logger.trace(executionContext, "Exit");
		}
	}
}
class MessengerDialogChooseVariantTextActivity extends MessengerDialogChooseVariantActivity {
	public readonly text: string;

	public constructor(opts: {
		readonly text: string;
		readonly child: Activity;
	}) {
		super();

		this.text = opts.text;
	}

	protected async onExecute(executionContext: FExecutionContext): Promise<void> {
		this._logger.trace(executionContext, "Enter");
		try {
			const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

			// const childIndex: number = vmContext.callCounter - 1;
			// if (childIndex < this.children.length) {
			// 	await vmContext.stackPush(executionContext, childIndex);
			// } else {
			// 	vmContext.stackPop(); // remove itself
			// }

			await FSleep(executionContext, 1000);
		} finally {
			this._logger.trace(executionContext, "Exit");
		}
	}
}

class MessengerDialogChooseActivity extends MessengerDialogMessageActivity {
	private readonly _dialogStartMessage: string;
	private readonly _dialogRetryMessage: string;

	public constructor(opts: {
		readonly retryMessage: string;
		readonly startMessage: string;
		readonly children: ReadonlyArray<MessengerDialogChooseItemActivity>;
	}) {
		super(...opts.children);
		this._dialogStartMessage = opts.startMessage;
		this._dialogRetryMessage = opts.retryMessage;
	}

	protected async onExecute(executionContext: FExecutionContext): Promise<void> {
		this._logger.trace(executionContext, "Enter");

		try {
			const { instance: messengerService } = SingletonProviderExecutionContext.of(executionContext, MessengerService);
			const { instance: databaseFactory } = SingletonProviderExecutionContext.of(executionContext, DatabaseFactory);
			const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

			const chatToken: string = vmContext.variables.getString("chatToken");
			const dialogId: DialogIdentifier = DialogIdentifier.parse(vmContext.variables.getString("dialogId"));

			const messenger: Messenger = messengerService.getMessenger("bot1");

			function recursiveBuilder(activity: MessengerDialogChooseItemActivity): MessengerDialogChooseVariant {
				if (activity instanceof MessengerDialogChooseVariantTextActivity) {
					return new MessengerDialogChooseVariantText(activity.text);
				} else if (activity instanceof MessengerDialogChooseVariantGroupActivity) {
					return new MessengerDialogChooseVariantGroup(
						activity.children.map(child => recursiveBuilder(child as MessengerDialogChooseVariantActivity))
					);
				} else {
					throw new FExceptionInvalidOperation(`Unsupported activity '${activity.constructor.name}' in the tree`);
				}
			}

			await FSleep(executionContext, 180);

			if (vmContext.callCounter < 100) {
				await databaseFactory.using(executionContext, async (dbExecutionContext, database) => {
					const dialogMessages: Array<DialogMessage> = await database
						.listDialogMessage(dbExecutionContext,
							{ dialogId, isProcessed: false },
							{ limit: 1 },
						);
					if (dialogMessages.length === 0) {
						// no any new messages
						return;
					}

					const dialogMessage: DialogMessage = dialogMessages[0]!;
					if (dialogMessage.dialogMessageProcessedAt !== null) {
						throw new FExceptionInvalidOperation("Unexpected dialog message: already processed");
					}

					await messenger.dialog.choose(
						executionContext,
						dialogId,
						chatToken,
						new MessengerDialogChooseVariantGroup([
							...this.children.map((child) => recursiveBuilder(child as MessengerDialogChooseItemActivity)),
						]),
						vmContext.callCounter === 1 ? this._dialogStartMessage : this._dialogRetryMessage,
					);

					await database.markDialogMessageAsProcessed(dbExecutionContext, dialogMessage);
				});
			} else if (vmContext.callCounter >= 100 && vmContext.callCounter < 200) {
				throw new FException("Olololo");
			} else {
				vmContext.stackPop(); // remove itself
			}
		} finally {
			this._logger.trace(executionContext, "Exit");
		}
	}
}


const MessengerDialogActivityExceptionMessageVariable = "MessengerDialogActivityExceptionMessageVariable";
class MessengerDialogActivity extends NativeActivity {
	private readonly _closeDialogMessage: string;

	public constructor(opts: {
		readonly closeDialogMessage: string;
		readonly child: MessengerDialogMessageActivity;
	}) {
		super(
			new TryCatchActivity({
				tryActivity: opts.child,
				catchActivity: new NopActivity(),
				exceptionMessageVariable: MessengerDialogActivityExceptionMessageVariable
			})
		);
		this._closeDialogMessage = opts.closeDialogMessage;
	}

	protected async onExecute(executionContext: FExecutionContext): Promise<void> {
		this._logger.trace(executionContext, "Enter");

		try {
			const { instance: messengerService } = SingletonProviderExecutionContext.of(executionContext, MessengerService);
			const { vmContext } = WorkflowVirtualMachineNativeExecutionContext.of(executionContext);

			const chatToken: string = vmContext.variables.getString("chatToken");
			const dialogId: DialogIdentifier = DialogIdentifier.parse(vmContext.variables.getString("dialogId"));

			if (vmContext.callCounter === 1) {
				vmContext.variables.defineInherit(MessengerDialogActivityExceptionMessageVariable, null);
				await vmContext.stackPush(executionContext, 0);
				return;
			}

			const messenger: Messenger = messengerService.getMessenger("bot1");

			const exData: string | null = vmContext.variables.has(MessengerDialogActivityExceptionMessageVariable)
				? vmContext.variables.getNullableString(MessengerDialogActivityExceptionMessageVariable)
				: null;

			if (exData === null) {
				await messenger.dialog.reset(
					executionContext,
					dialogId,
					chatToken,
					this._closeDialogMessage,
				);
				vmContext.stackPop(); // remove itself
			} else {
				await messenger.dialog.reset(
					executionContext,
					dialogId,
					chatToken,
					`Трясця! Щось пішло не так...\n\nTrace ID: <code>${dialogId.value}</code>`,
				);
				throw new FException(exData);
			}
		} finally {
			this._logger.trace(executionContext, "Exit");
		}
	}
}

@Activity.Id("0ac53c6f-30a7-4cd9-a667-f6272dff44d4")
export class HelloWorld2 extends SequenceActivity {
	public constructor() {
		super(
			new MessengerDialogActivity({
				closeDialogMessage: "Бувай! Чекаю на тебе знов...",
				child: new MessengerDialogChooseActivity({
					startMessage: "Привіт! Чим я можу тобі допомогти?",
					retryMessage: "Упс... Я не зрозумів твій вибір...",
					children: [
						new MessengerDialogChooseVariantTextActivity({
							text: "Переглянути статус замовлення",
							child: new LoggerActivity("Chose order status"),
						}),
						new MessengerDialogChooseVariantGroupActivity({
							children: [
								new MessengerDialogChooseVariantTextActivity({
									text: "Пошук товарів",
									child: new SequenceActivity(
										new LoggerActivity("Chose FPV present"),
									),
								}),
								new MessengerDialogChooseVariantTextActivity({
									text: "FPV Дрон на подарунок",
									child: new SequenceActivity(
										new LoggerActivity("Chose FPV present"),
									),
								}),
								new MessengerDialogChooseVariantTextActivity({
									text: "Регулярне виробництво",
									child: new LoggerActivity("Chose regular production"),
								}),
							]
						}),
					],
				}),
			})
		);
	}
}
