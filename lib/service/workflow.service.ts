import {
	FException,
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
	MessengerDialogChooseVariantGroup,
	MessengerDialogChooseVariantText,
} from "../messenger/index.js";
import { Bind } from "../utils/bind.js";
import { Activity, ActivityIdentifier, NativeActivity, WorkflowApplication, WorkflowCache, WorkflowIdentifier, WorkflowRunner } from "../2nd/workflow/index.js";
import { DatabaseFactory } from "../index.js";
import { Dialog } from "../model/dialog.js";
import { WorkflowDatabase, WorkflowDatabaseFactory } from "../2nd/workflow/workflow_database.js";
import { Database } from "../database/index.js";
import { Workflow, WorkflowTick } from "../2nd/workflow/workflow_model.js";
import { DialogIdentifier } from "../model/identifiers.js";
import { MessengerDialogMessageActivity } from "../business/dialog/hello_world.js";
import { data } from "../2nd/workflow/redis/lockNextWorkflowApplication-4.js";
import { MessengerDialog } from "../messenger/messenger.js";

export abstract class WorkflowService extends FInitableBase {
}

export class WorkflowServiceImpl extends WorkflowService {
	private readonly _logger: FLogger;
	private readonly _messengers: ReadonlyMap<Settings.Messenger["name"], Messenger>;
	private readonly _sqlConnectionFactory: FSqlConnectionFactory;
	private readonly _databaseFactory: DatabaseFactory;
	private readonly _workflowCache: WorkflowCache;
	private readonly _workflowDatabaseFactory: WorkflowDatabaseFactory;
	private readonly _workflowRunner: WorkflowRunner;
	private readonly _workflows: Array<Settings.Workflow & {
		readonly entryPointActivity: Activity.Constructor;
	}>;

	public constructor(
		settings: {
			readonly workflows: Array<Settings.Workflow>;
		},
		providers: {
			readonly messengers: ReadonlyMap<Settings.Messenger["name"], Messenger>;
			readonly sqlConnectionFactory: FSqlConnectionFactory;
			readonly databaseFactory: DatabaseFactory;
			readonly workflowCache: WorkflowCache;
			readonly workflowDatabaseFactory: WorkflowDatabaseFactory;
			readonly workflowRunner: WorkflowRunner;
		}
	) {
		super();

		this._logger = FLogger.create(this.constructor.name);
		this._messengers = providers.messengers;
		this._sqlConnectionFactory = providers.sqlConnectionFactory;
		this._databaseFactory = providers.databaseFactory;
		this._workflowCache = providers.workflowCache;
		this._workflowDatabaseFactory = providers.workflowDatabaseFactory;
		this._workflowRunner = providers.workflowRunner;
		this._workflows = settings.workflows.map((workflowSettings) => Object.freeze({
			...workflowSettings,
			entryPointActivity: Activity.getActivityConstructor(workflowSettings.entryPointActivityUUID),
		}));

		// for (const workflow of this._workflows) {
		// 	//
		// 	const {
		// 		name,
		// 		entryPointActivityUUID,
		// 		entryPointActivity,
		// 	} = workflow;

		// 	this._logger.trace(
		// 		name,
		// 		entryPointActivityUUID,
		// 		entryPointActivity,
		// 	);
		// }
	}

	protected override async onInit(): Promise<void> {
		this._logger.trace(this.initExecutionContext, "Initializing");
		for (const messenger of this._messengers.values()) {
			messenger.dialog.addHandler(this._onDialogEvent);
		}
	}

	protected override async onDispose(): Promise<void> {
		this._logger.trace(this.initExecutionContext, "Disposing");
		for (const messenger of this._messengers.values()) {
			messenger.dialog.removeHandler(this._onDialogEvent);
		}
	}

	@Bind
	private async _onDialogEvent(executionContext: FExecutionContext, event: MessengerDialog.Event) {
		try {
			const logger: FLogger = this._logger;

			const { messenger, chatToken, data: eventArgs } = event;
			const { text: incomingDialogMessage } = eventArgs;

			executionContext = new FLoggerLabelsExecutionContext(executionContext, {
				"chatToken": chatToken,
			});

			logger.debug(executionContext, () => `Got workflow event`);

			const dialog: Dialog & Workflow & WorkflowTick = await this._sqlConnectionFactory.usingConnectionWithTransaction(
				executionContext,
				async (
					dbExecutionContext: FExecutionContext,
					sqlConnection: FSqlConnection,
				): Promise<Dialog & Workflow & WorkflowTick> => {

					await using database = await Database.fromSqlConnection(dbExecutionContext, sqlConnection);
					await using workflowDatabase: WorkflowDatabase = await WorkflowDatabase.fromSqlConnection(executionContext, sqlConnection);

					{ // is exists?
						const existingDialog: Dialog | null = await database
							.findDialog(dbExecutionContext, {
								dialogMessengerChatToken: chatToken,
								activeOnly: true,
							});
						if (existingDialog !== null) {

							await database.createDialogMessage(dbExecutionContext, {
								dialogId: existingDialog.dialogId,
								dialogMessageText: incomingDialogMessage,
							});

							// const existingWorkflowApplication: WorkflowApplication
							// 	= await this._workflowRunner.lockWorkflowApplication(
							// 		executionContext,
							// 		existingDialog.workflowId,
							// 	);

							const workflow: Workflow & WorkflowTick = await workflowDatabase.getWorkflowById(
								dbExecutionContext,
								existingDialog.workflowId,
							);

							// WorkflowApplication.lockNextWorkflowApplication(
							// 	executionContext,
							// 	this._workflowCache,
							// 	workflowDatabase,
							// );

							// console.error(existingWorkflowApplication.currentActivity.constructor);
							// if (existingWorkflowApplication.currentActivity instanceof MessengerDialogMessageActivity) {
							await messenger.dialog.setPendingStatus(executionContext, chatToken);
							// }

							// await existingWorkflowApplication.unlock(executionContext);

							return Object.freeze<Dialog & Workflow & WorkflowTick>({
								...existingDialog,
								...workflow,
							});
						}
					}

					await messenger.dialog.setPendingStatus(executionContext, chatToken);

					const messengerDialogEntryPointActivityId: ActivityIdentifier
						= ActivityIdentifier.fromUuid("0ac53c6f-30a7-4cd9-a667-f6272dff44d4");

					const EntryPointActivity: Activity.Constructor
						= Activity.getActivityConstructor(messengerDialogEntryPointActivityId.uuid);

					const wfActivity: NativeActivity = new EntryPointActivity() as NativeActivity;
					const wfApp = WorkflowApplication.create(this._workflowCache, wfActivity);

					const dialogId: DialogIdentifier = DialogIdentifier.fromUuid(wfApp.workflowUuid);

					wfApp.defineVariable("chatToken", chatToken);
					wfApp.defineVariable("dialogId", dialogId.value);

					await wfApp.persist(dbExecutionContext, workflowDatabase, []);

					const workflowId: WorkflowIdentifier = WorkflowIdentifier.fromUuid(wfApp.workflowUuid);

					const newDialog: Dialog = await database.createDialog(dbExecutionContext, {
						dialogId,
						dialogMessengerChatToken: chatToken,
						dialogMessengerName: messenger.name,
						dialogMessengerType: "telegram",
						workflowId,
					});

					await database.createDialogMessage(dbExecutionContext, {
						dialogId,
						dialogMessageText: incomingDialogMessage,
					});

					await wfApp.unlock(dbExecutionContext);

					const workflow: Workflow & WorkflowTick = await workflowDatabase.getWorkflowById(
						dbExecutionContext,
						workflowId,
					)

					return Object.freeze<Dialog & Workflow & WorkflowTick>({
						...newDialog,
						...workflow,
					});
				}
			);
		}
		catch (e) {
			const ex: FException = FException.wrapIfNeeded(e);
			this._logger.debug(executionContext, "_onDialogEvent", ex);
			throw ex;
		}
	}
}
