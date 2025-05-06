import {
	FException,
	FExceptionInvalidOperation,
	FExecutionContext,
	FSqlConnection,
	FSqlData,
	FSqlResultRecord,
	FSqlStatementParam,
} from '@freemework/common';
import {
	FSqlConnectionFactoryPostgres,
} from '@freemework/sql.postgres';

// import {
//   Application, ApplicationIdentifier,
//   ApplicationCheckpoint,
//   CustomerIdentifier,
//   DiiaOfferSharing, DiiaOfferSharingIdentifier,
//   DiiaOfferSign, DiiaOfferSignIdentifier,
//   DiiaOnlineDocRequest, DiiaOnlineDocRequestIdentifier, DiiaOnlineDocRequestWithoutQrCode,
//   DiiaSignDocs, DiiaSignDocsIdentifier, DiiaSignDocsWithoutQrCode,
//   Document,
//   DocumentIdentifier,
//   FileIdentifier,
//   SystemProperty,
//   Customer,
//   assertIsApplicationPage,
//   ApplicationPage,
//   finalApplicationPageMap,
// } from '@credits/checkout.contract';

import { Database } from '../database.js';
import { DatabaseSql } from '../database_sql.js';
import { Dialog } from '../../model/dialog.js';
import { DialogIdentifier, DialogMessageIdentifier } from '../../model/identifiers.js';
import { assertIsMessengerKind } from '../../messenger/index.js';
import { WorkflowIdentifier } from '../../2nd/workflow/index.js';
import { DialogMessage } from '../../model/dialog_message.js';

export class PostgresDatabase extends DatabaseSql {
	public readonly dbInstanceNumber: number;

	public constructor(sqlConnectionOrFactory: FSqlConnection | FSqlConnectionFactoryPostgres) {
		super(sqlConnectionOrFactory);
		if (PostgresDatabase.dbInstanceCounter === Number.MAX_SAFE_INTEGER) {
			throw new FExceptionInvalidOperation('Unable to create Database instance due to maximum counter. Pls, restart the application.');
		}
		this.dbInstanceNumber = PostgresDatabase.dbInstanceCounter++;
	}

	public override async createDialog(
		executionContext: FExecutionContext,
		opts: Partial<Dialog.Id> & Dialog.Data,
	): Promise<Dialog> {
		super.verifyInitializedAndNotDisposed();

		const columns: Array<string> = [
			/* 1 */"workflow_uuid",
			/* 2 */"messenger_name",
			/* 3 */"messenger_type",
			/* 4 */"messenger_chat_token",
		];
		const placeholders: Array<string> = [
			/* 1 */"$1::UUID",
			/* 2 */"$2::TEXT",
			/* 3 */"$3::TEXT",
			/* 4 */"$4::TEXT",
		];
		const params: Array<FSqlStatementParam> = [
			/* 1 */opts.workflowId.uuid,
			/* 2 */opts.dialogMessengerName,
			/* 3 */opts.dialogMessengerType,
			/* 4 */opts.dialogMessengerChatToken,
		];
		if (opts.dialogId !== undefined) {
			columns.push("uuid");
			placeholders.push(`$${columns.length}::UUID`);
			params.push(opts.dialogId.uuid);
		}

		const dialogSqlRecord: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
				INSERT INTO "dialog" (${columns.map(c => '"' + c + '"').join(",")})
				VALUES (${placeholders.join(",")})
				RETURNING "uuid", "workflow_uuid", "messenger_name", "messenger_type", "messenger_chat_token", "utc_created_at"
			`)
			.executeSingle(
				executionContext,
				...params,
			);

		return mapDialog(dialogSqlRecord);
	}

	public override async createDialogMessage(
		executionContext: FExecutionContext,
		data: Partial<DialogMessage.Id> & DialogMessage.Data,
	): Promise<DialogMessage> {
		super.verifyInitializedAndNotDisposed();

		const columns: Array<string> = [
			/* 1 */"dialog_uuid",
			/* 2 */"text",
		];
		const placeholders: Array<string> = [
			/* 1 */"$1::UUID",
			/* 2 */"$2::TEXT",
		];
		const params: Array<FSqlStatementParam> = [
			/* 1 */data.dialogId.uuid,
			/* 2 */data.dialogMessageText
		];
		if (data.dialogMessageId !== undefined) {
			columns.push("uuid");
			placeholders.push(`$${columns.length}::UUID`);
			params.push(data.dialogMessageId.uuid);
		}

		const dialogSqlRecord: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
				INSERT INTO "dialog_message" (${columns.map(c => '"' + c + '"').join(",")})
				VALUES (${placeholders.join(",")})
				RETURNING "uuid", "dialog_uuid", "text", "utc_created_at", "utc_processed_at"
			`)
			.executeSingle(
				executionContext,
				...params,
			);

		return mapDialogMessage(dialogSqlRecord);
	}

	public override async findDialog(
		executionContext: FExecutionContext,
		filter: Dialog.Id | Dialog.MessengerChatToken | { activeOnly: true; },
	): Promise<Dialog | null> {
		super.verifyInitializedAndNotDisposed();

		const conditionStatements: Array<string> = [];
		const conditionParams: Array<FSqlStatementParam> = [];

		if ("dialogId" in filter) {
			// by "dialogId"
			conditionParams.push(filter.dialogId.uuid);
			conditionStatements.push(`"uuid" = $${conditionParams.length}`);
		}
		if ("dialogMessengerChatToken" in filter) {
			// by "dialogMessengerChatToken"
			conditionParams.push(filter.dialogMessengerChatToken);
			conditionStatements.push(`"messenger_chat_token" = $${conditionParams.length}`);
		}
		if ("activeOnly" in filter) {
			conditionStatements.push(`
				(
					SELECT 1 
					FROM "vw_last_workflow_tick" AS WT
					WHERE
						WT."workflow_uuid" = D."workflow_uuid"
						AND WT."workflow_status" IN ('WORKING','SLEEPING')
				) IS NOT NULL
			`);
		}

		const dialogSqlRecord: FSqlResultRecord | null = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
			SELECT D."uuid", D."workflow_uuid", D."messenger_name", D."messenger_type", D."messenger_chat_token", D."utc_created_at"
			FROM "dialog" AS D
			WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
		`)
			.executeSingleOrNull(
				executionContext,
				...conditionParams,
			);

		if (dialogSqlRecord === null) {
			return null;
		}

		return mapDialog(dialogSqlRecord);
	}

	public override async getDialogMessage(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id,
	): Promise<DialogMessage> {
		super.verifyInitializedAndNotDisposed();

		const conditionStatements: Array<string> = [];
		const conditionParams: Array<FSqlStatementParam> = [];

		if (filter.dialogMessageId !== undefined) {
			conditionParams.push(filter.dialogMessageId.uuid);
			conditionStatements.push(`"uuid" = $${conditionParams.length}`);
		}

		const dialogSqlRecord: FSqlResultRecord = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
			SELECT "uuid", "dialog_uuid", "text", "utc_created_at", "utc_processed_at"
			FROM "dialog_message"
			WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
		`)
			.executeSingle(
				executionContext,
				...conditionParams,
			);

		return mapDialogMessage(dialogSqlRecord);
	}

	public override async listDialogMessage(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id | Dialog.Id | { isProcessed: boolean },
		opts: {
			readonly limit?: number;
		}
	): Promise<Array<DialogMessage>> {
		super.verifyInitializedAndNotDisposed();

		const conditionStatements: Array<string> = [];
		const sqlParams: Array<FSqlStatementParam> = [];
		let limitStatement = "";

		if ("dialogMessageId" in filter) {
			sqlParams.push(filter.dialogMessageId.uuid);
			conditionStatements.push(`"uuid" = $${sqlParams.length}`);
		}
		if ("dialogId" in filter) {
			sqlParams.push(filter.dialogId.uuid);
			conditionStatements.push(`"dialog_uuid" = $${sqlParams.length}`);
		}
		if ("isProcessed" in filter) {
			conditionStatements.push(`"utc_processed_at" IS ${ filter.isProcessed ? 'NOT NULL' : 'NULL' }`);
		}

		if("limit" in opts && opts.limit !== undefined) {
			sqlParams.push(opts.limit);
			limitStatement = `LIMIT $${sqlParams.length}`;
		}

		const dialogSqlRecords: ReadonlyArray<FSqlResultRecord> = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
			SELECT "uuid", "dialog_uuid", "text", "utc_created_at", "utc_processed_at"
			FROM "dialog_message"
			WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
			ORDER BY "utc_created_at"
			${limitStatement}
		`)
			.executeQuery(
				executionContext,
				...sqlParams,
			);

		return dialogSqlRecords.map(mapDialogMessage);
	}

	public async listVersions(
		executionContext: FExecutionContext,
	): Promise<Array<string>> {
		super.verifyInitializedAndNotDisposed();

		const versionRows: ReadonlyArray<FSqlResultRecord> = await this.sqlContinuouslyTransaction.sqlConnection
			.statement('SELECT "version" FROM "public"."__migration" ORDER BY "version" DESC')
			.executeQuery(executionContext);
		return versionRows.map(versionRow => versionRow.get("version").asString);
	}

	public override async markDialogMessageAsProcessed(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id,
	): Promise<void> {
		const sqlProcessedAt: FSqlData = await this.sqlContinuouslyTransaction.sqlConnection.statement(`
			SELECT "utc_processed_at" FROM "dialog_message" WHERE "uuid" = $1 FOR UPDATE
		`)
			.executeScalar(executionContext,
				/* 1 */filter.dialogMessageId.uuid,
			);

		const dialogMessageProcessedAt: Date | null = sqlProcessedAt.asDateNullable;
		if (dialogMessageProcessedAt !== null) {
			throw new FExceptionInvalidOperation(`Wrong operation. Dialog message '${filter.dialogMessageId.value}' already processed.`);
		}

		await this.sqlContinuouslyTransaction.sqlConnection.statement(`
			UPDATE "dialog_message"
			SET "utc_processed_at" = (now() AT TIME ZONE 'utc')
			WHERE "uuid" = $1
		`)
			.execute(executionContext,
				/* 1 */filter.dialogMessageId.uuid,
			);
	}

	protected static dbInstanceCounter = 0;
}

function mapDialog(
	dialogSqlRecord: FSqlResultRecord,
): Dialog {
	const dialogUuid: string = dialogSqlRecord.get("uuid").asString;
	const workflowUuid: string = dialogSqlRecord.get("workflow_uuid").asString;
	const dialogMessengerName: string = dialogSqlRecord.get("messenger_name").asString;
	const dialogMessengerType: string = dialogSqlRecord.get("messenger_type").asString;
	const dialogMessengerChatToken: string = dialogSqlRecord.get("messenger_chat_token").asString;
	const dialogCreatedAt: Date = dialogSqlRecord.get("utc_created_at").asDate;

	assertIsMessengerKind(dialogMessengerType);

	return Object.freeze<Dialog>({
		dialogId: DialogIdentifier.fromUuid(dialogUuid),
		workflowId: WorkflowIdentifier.fromUuid(workflowUuid),
		dialogMessengerName,
		dialogMessengerType,
		dialogMessengerChatToken,
		dialogCreatedAt,
	});
}

function mapDialogMessage(
	dialogSqlRecord: FSqlResultRecord,
): DialogMessage {
	const dialogMessageUuid: string = dialogSqlRecord.get("uuid").asString;
	const dialogUuid: string = dialogSqlRecord.get("dialog_uuid").asString;
	const dialogMessageText: string = dialogSqlRecord.get("text").asString;
	const dialogMessageCreatedAt: Date = dialogSqlRecord.get("utc_created_at").asDate;
	const dialogMessageProcessedAt: Date | null = dialogSqlRecord.get("utc_processed_at").asDateNullable;

	return Object.freeze<DialogMessage>({
		dialogMessageId: DialogMessageIdentifier.fromUuid(dialogMessageUuid),
		dialogId: DialogIdentifier.fromUuid(dialogUuid),
		dialogMessageText,
		dialogMessageCreatedAt,
		dialogMessageProcessedAt,
	});
}
