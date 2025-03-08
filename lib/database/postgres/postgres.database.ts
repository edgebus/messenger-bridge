import {
	FException,
	FExceptionInvalidOperation,
	FExecutionContext,
	FSqlData,
	FSqlResultRecord,
	FSqlStatementParam,
} from '@freemework/common';
import { FSqlConnectionFactoryPostgres } from '@freemework/sql.postgres';

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

import { DatabaseSql } from '../database_sql.js';

export class PostgresDatabase extends DatabaseSql {
	public readonly dbInstanceNumber: number;

	public constructor(sqlConnectionFactory: FSqlConnectionFactoryPostgres) {
		super(sqlConnectionFactory);
		if (PostgresDatabase.dbInstanceCounter === Number.MAX_SAFE_INTEGER) {
			throw new FExceptionInvalidOperation('Unable to create Database instance due to maximum counter. Pls, restart the application.');
		}
		this.dbInstanceNumber = PostgresDatabase.dbInstanceCounter++;
	}

	//   public override async createApplication(
	//     executionContext: FExecutionContext,
	//     opts: Partial<Application.Id> & Application.Data & FNullable<Customer.Id>,
	//   ): Promise<Application> {
	//     if (opts.applicationTtlSeconds === null) {
	//       // TODO: ... Видалити ...
	//       // Ця перевірка тимчасова, на перехідний час, до моменту поки
	//       // в БД на всі апплікейшени буде проставлено значення ttl_seconds
	//       // та поле не стане non-NULLable
	//       throw new FExceptionInvalidOperation("Cannot create an application without  Ttl Seconds value.");
	//     }

	//     super.verifyInitializedAndNotDisposed();

	//     let applicationSqlRecord: FSqlResultRecord;
	//     {
	//       const columns: Array<string> = [
	//         /* 1 */"rid",
	//         /* 2 */"order_id",
	//         /* 3 */"data",
	//         /* 4 */"status",
	//         /* 5 */"return_url",
	//         /* 6 */"ttl_seconds",
	//       ];
	//       const placeholders: Array<string> = [
	//         /* 1 */"$1::UUID",
	//         /* 2 */"$2::UUID",
	//         /* 3 */"$3::JSONB",
	//         /* 4 */"$4::TEXT",
	//         /* 5 */"$5::TEXT",
	//         /* 6 */"$6::INT",
	//       ];
	//       const params: Array<FSqlStatementParam> = [
	//         /* 1 */opts.customerId === null ? null : opts.customerId.uuid,
	//         /* 2 */opts.applicationOrderId,
	//         /* 3 */JSON.stringify(opts.applicationRawData),
	//         /* 4 */opts.applicationStatus,
	//         /* 5 */opts.applicationReturnUrl.toString(),
	//         /* 6 */opts.applicationTtlSeconds,
	//       ];
	//       if (opts.applicationId !== undefined) {
	//         columns.push("id");
	//         placeholders.push(`$${columns.length}::UUID`);
	//         params.push(opts.applicationId.uuid);
	//       }

	//       applicationSqlRecord = await this.sqlConnection.statement(`
	//         INSERT INTO "application" (${columns.map(c => '"' + c + '"').join(",")})
	//         VALUES (${placeholders.join(",")})
	//         RETURNING "id", "rid", "order_id", "return_url", "data", "status", "utc_created_at", "utc_updated_at", "ttl_seconds"
	//       `)
	//         .executeSingle(
	//           executionContext,
	//           ...params,
	//         );
	//     }

	//     let applicationOrderSqlRecord: FSqlResultRecord;
	//     {
	//       const columns: Array<string> = [
	//       /* 1 */"application_id",
	//       /* 2 */"amount",
	//       /* 3 */"currency",
	//       /* 4 */"parts_count",
	//       /* 5 */"products",
	//       ];
	//       const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::INT",
	//       /* 3 */"$3::TEXT",
	//       /* 4 */"$4::INT",
	//       /* 5 */"$5::TEXT[]",
	//       ];
	//       const params: Array<FSqlStatementParam> = [
	//       /* 1 */applicationSqlRecord.get("id").asString,
	//       /* 2 */opts.applicationOrderData.amount,
	//       /* 3 */opts.applicationOrderData.currency,
	//       /* 4 */opts.applicationOrderData.partsCount,
	//       /* 5 */opts.applicationOrderData.products,
	//       ];

	//       applicationOrderSqlRecord = await this.sqlConnection.statement(`
	//         INSERT INTO "application_order" (${columns.map(c => '"' + c + '"').join(",")})
	//         VALUES (${placeholders.join(",")})
	//         RETURNING "amount", "currency", "parts_count", "products"
	//       `)
	//         .executeSingle(
	//           executionContext,
	//           ...params,
	//         );
	//     }

	//     return mapApplication(applicationSqlRecord, applicationOrderSqlRecord);
	//   }

	//   public override async createApplicationCheckpoint(
	//     executionContext: FExecutionContext,
	//     opts: ApplicationCheckpoint.Id & ApplicationCheckpoint.Data,
	//   ): Promise<ApplicationCheckpoint> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "application_checkpoint" ("application_id", "kind")
	//       VALUES ($1::UUID, $2::TEXT)
	//       RETURNING "application_id", "kind", "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         /* 1 */opts.applicationId.uuid,
	//         /* 2 */opts.applicationCheckpointKind,
	//       );

	//     return mapApplicationCheckpoint(sqlRecord);
	//   }

	//   public override async createDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id & DiiaOfferSharing.Data,
	//   ): Promise<DiiaOfferSharing> {
	//     super.verifyInitializedAndNotDisposed();

	//     const columns: Array<string> = [
	//       /* 1 */"id",
	//       /* 2 */"offer_ref",
	//     ];
	//     const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::TEXT",
	//     ];
	//     const params: Array<FSqlStatementParam> = [
	//       /* 1 */opts.diiaOfferSharingId.uuid,
	//       /* 2 */opts.diiaOfferSharingReference,
	//     ];

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "diia_offer_sharing" (${columns.map(c => '"' + c + '"').join(",")})
	//       VALUES (${placeholders.join(",")})
	//       RETURNING ${columns.map(c => '"' + c + '"').join(",")}, "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...params,
	//       );

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSharing = {
	//       diiaOfferSharingId: DiiaOfferSharingIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSharingReference: offerRef,
	//       diiaOfferSharingCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async createDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id & DiiaOfferSign.Data,
	//   ): Promise<DiiaOfferSign> {
	//     super.verifyInitializedAndNotDisposed();

	//     const columns: Array<string> = [
	//       /* 1 */"id",
	//       /* 2 */"offer_ref",
	//     ];
	//     const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::TEXT",
	//     ];
	//     const params: Array<FSqlStatementParam> = [
	//       /* 1 */opts.diiaOfferSignId.uuid,
	//       /* 2 */opts.diiaOfferSignReference,
	//     ];

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "diia_offer_sign" (${columns.map(c => '"' + c + '"').join(",")})
	//       VALUES (${placeholders.join(",")})
	//       RETURNING ${columns.map(c => '"' + c + '"').join(",")}, "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...params,
	//       );

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSign = {
	//       diiaOfferSignId: DiiaOfferSignIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSignReference: offerRef,
	//       diiaOfferSignCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async createDiiaOnlineDocRequest(
	//     executionContext: FExecutionContext,
	//     opts:
	//       & DiiaOfferSharing.Id
	//       & Partial<DiiaOnlineDocRequest.Id>
	//       & DiiaOnlineDocRequest.ClientRequestToken
	//       & DiiaOnlineDocRequest.DeepLink
	//       & DiiaOnlineDocRequest.DocumentReference,
	//   ): Promise<DiiaOnlineDocRequestWithoutQrCode> {
	//     super.verifyInitializedAndNotDisposed();

	//     const columns: Array<string> = [
	//       /* 1 */"diia_offer_sharing_id",
	//       /* 2 */"client_request_token",
	//       /* 3 */"deeplink",
	//       /* 4 */"document_reference_identifier",
	//     ];
	//     const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::UUID",
	//       /* 3 */"$3::TEXT",
	//       /* 4 */"$4::TEXT",
	//     ];
	//     const params: Array<FSqlStatementParam> = [
	//       /* 1 */opts.diiaOfferSharingId.uuid,
	//       /* 2 */opts.diiaOnlineDocRequestClientRequestToken,
	//       /* 3 */opts.diiaOnlineDocRequestDeepLink.toString(),
	//       /* 4 */opts.diiaOnlineDocRequestDocumentReferenceIdentifier,
	//     ];

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "diia_online_doc_request" (${columns.map(c => '"' + c + '"').join(",")})
	//       VALUES (${placeholders.join(",")})
	//       RETURNING "id", ${columns.map(c => '"' + c + '"').join(",")}, "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...params,
	//       );

	//     const dbId: string = sqlRecord.get("id").asString;
	//     const offerDbId: string = sqlRecord.get("diia_offer_sharing_id").asString;
	//     const clientRequestToken: string = sqlRecord.get("client_request_token").asString;
	//     const deepLink: string = sqlRecord.get("deeplink").asString;
	//     const documentReferenceIdentifier: string = sqlRecord.get("document_reference_identifier").asString;
	//     const createdAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOnlineDocRequest: DiiaOnlineDocRequestWithoutQrCode = {
	//       diiaOnlineDocRequestId: DiiaOnlineDocRequestIdentifier.fromUuid(dbId),
	//       diiaOfferSharingId: DiiaOfferSharingIdentifier.fromUuid(offerDbId),
	//       diiaOnlineDocRequestClientRequestToken: clientRequestToken,
	//       diiaOnlineDocRequestDeepLink: new URL(deepLink),
	//       diiaOnlineDocRequestDocumentReferenceIdentifier: documentReferenceIdentifier,
	//       diiaOnlineDocRequestCreatedAt: createdAt,
	//     };

	//     return Object.freeze(diiaOnlineDocRequest);
	//   }

	//   public override async createDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts:
	//       & Partial<DiiaSignDocs.Id>
	//       & DiiaOfferSign.Id
	//       & DiiaSignDocs.ClientRequestToken
	//       & DiiaSignDocs.CallbackToken
	//       & DiiaSignDocs.DeepLink,
	//   ): Promise<DiiaSignDocsWithoutQrCode> {
	//     super.verifyInitializedAndNotDisposed();

	//     const columns: Array<string> = [
	//       /* 1 */"diia_offer_sign_id",
	//       /* 2 */"client_request_token",
	//       /* 3 */"deeplink",
	//       /* 4 */"callback_token",
	//     ];
	//     const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::UUID",
	//       /* 3 */"$3::TEXT",
	//       /* 4 */"$4::UUID",
	//     ];
	//     const params: Array<FSqlStatementParam> = [
	//       /* 1 */opts.diiaOfferSignId.uuid,
	//       /* 2 */opts.diiaSignDocsClientRequestToken,
	//       /* 3 */opts.diiaSignDocsDeepLink.toString(),
	//       /* 4 */opts.diiaSignDocsCallbackToken,
	//     ];

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "diia_sign_docs" (${columns.map(c => '"' + c + '"').join(",")})
	//       VALUES (${placeholders.join(",")})
	//       RETURNING "id", ${columns.map(c => '"' + c + '"').join(",")}, "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...params,
	//       );

	//     return mapDiiaSignDocs(sqlRecord);
	//   }

	//   public override async createDocument(
	//     executionContext: FExecutionContext,
	//     opts: Partial<Document.Id> & Document.Data,
	//   ): Promise<Document> {
	//     super.verifyInitializedAndNotDisposed();

	//     const columns: Array<string> = [
	//       /* 1 */"application_id",
	//       /* 2 */"issuer",
	//       /* 3 */"type",
	//       /* 4 */"title",
	//       /* 5 */"file_name",
	//     ];
	//     const placeholders: Array<string> = [
	//       /* 1 */"$1::UUID",
	//       /* 2 */"$2::TEXT",
	//       /* 3 */"$3::TEXT",
	//       /* 4 */"$4::TEXT",
	//       /* 5 */"$5::TEXT",
	//     ];
	//     const params: Array<FSqlStatementParam> = [
	//       /* 1 */opts.applicationId.uuid,
	//       /* 2 */opts.documentIssuer,
	//       /* 3 */opts.documentType,
	//       /* 4 */opts.documentTitle,
	//       /* 5 */opts.documentFileName,
	//     ];
	//     if (opts.documentId !== undefined) {
	//       columns.push("document_id");
	//       placeholders.push(`$${columns.length}::UUID`);
	//       params.push(opts.documentId.uuid);
	//     }
	//     if (opts.fileId !== undefined) {
	//       columns.push("file_id");
	//       placeholders.push(`$${columns.length}::UUID`);
	//       params.push(opts.fileId.uuid);
	//     }

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       INSERT INTO "documentium_doc" (${columns.map(c => '"' + c + '"').join(",")})
	//       VALUES (${placeholders.join(",")})
	//       RETURNING "document_id", "file_id", "application_id", "issuer", "type", "title", "file_name", "utc_created_at"
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...params,
	//       );

	//     return mapDocument(sqlRecord);
	//   }

	//   public override async findApplication(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id | Application.DataOrderId | Customer.Id,
	//   ): Promise<Application | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     if ("applicationId" in opts) {
	//       // by "applicationId"
	//       conditionParams.push(opts.applicationId.uuid);
	//       conditionStatements.push(`A."id" = $${conditionParams.length}`);
	//     }
	//     if ("applicationOrderId" in opts) {
	//       // by "applicationOrderId"
	//       conditionParams.push(opts.applicationOrderId);
	//       conditionStatements.push(`A."order_id" = $${conditionParams.length}`);
	//     }
	//     if ("customerId" in opts) {
	//       // by "customerId"
	//       conditionParams.push(opts.customerId.uuid);
	//       conditionStatements.push(`A."rid" = $${conditionParams.length}`);
	//     }

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT A."id", A."rid", A."order_id", A."return_url", A."data", A."status", A."utc_created_at", A."utc_updated_at", A."ttl_seconds",
	//         AO."amount", AO."currency", AO."parts_count", AO."products"
	//       FROM "application" AS A
	//       INNER JOIN "application_order" AS AO ON AO."application_id" = A."id"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     return mapApplication(sqlRecord, sqlRecord);
	//   }

	//   public override async findApplicationStatusAndReturnURL(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id,
	//   ): Promise<(Application.Id & Application.DataStatus & Application.InstanceUpdatedAt & Application.DataReturnURL) | null> {
	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT A."return_url", A."status", A."utc_updated_at"
	//       FROM "application" AS A
	//       WHERE A."id" = $1
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         opts.applicationId.uuid,
	//       );

	//     if (sqlRecord === null) { return null; }

	//     const returnUrlStr: string = sqlRecord.get("return_url").asString;
	//     const applicationUpdatedAt: Date = sqlRecord.get("utc_updated_at").asDate;
	//     const applicationStatus: string = sqlRecord.get("status").asString;

	//     assertIsApplicationPage(applicationStatus);

	//     const model = {
	//       applicationId: opts.applicationId,
	//       applicationReturnUrl: new URL(returnUrlStr),
	//       applicationUpdatedAt,
	//       applicationStatus,
	//     };

	//     return Object.freeze<Application.Id & Application.DataStatus & Application.InstanceUpdatedAt & Application.DataReturnURL>(model);
	//   }

	//   public override async findApplicationCheckpoint(
	//     executionContext: FExecutionContext,
	//     opts: ApplicationCheckpoint.Id,
	//   ): Promise<ApplicationCheckpoint | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     conditionParams.push(opts.applicationId.uuid);
	//     conditionStatements.push(`"application_id" = $${conditionParams.length}`);

	//     conditionParams.push(opts.applicationCheckpointKind);
	//     conditionStatements.push(`"kind" = $${conditionParams.length}`);

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT "application_id", "kind", "utc_created_at"
	//       FROM "application_checkpoint"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     return mapApplicationCheckpoint(sqlRecord);
	//   }

	//   public override async findApplicationExpirationCandidates(
	//     executionContext: FExecutionContext,
	//   ): Promise<Array<Application.Id & Application.DataOrderId>> {
	//     const nonExpirableStatuses: Array<ApplicationPage> = Object
	//       .entries(finalApplicationPageMap)
	//       .filter(([_page, isFinal]) => isFinal === true)
	//       .map(([page, _isFinal]) => page as ApplicationPage);

	//     const sqlRecords: ReadonlyArray<FSqlResultRecord> = await this.sqlConnection.statement(`
	//       SELECT DISTINCT A."id", A."order_id"
	//       FROM "application" AS A
	//       WHERE
	//         NOW() > (A."utc_updated_at" + A."ttl_seconds" * interval '1 second')
	//         AND NOT (A."status" = ANY ($1))
	//       ;
	//     `)
	//       .executeQuery(
	//         executionContext,
	//         nonExpirableStatuses,
	//       );

	//     return sqlRecords
	//       .map(sqlRecord => Object.freeze({
	//         applicationId: ApplicationIdentifier.fromUuid(sqlRecord.get("id").asString),
	//         applicationOrderId: sqlRecord.get("order_id").asString,
	//       }));
	//   }

	//   public override async findDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<DiiaOfferSharing | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     conditionParams.push(opts.diiaOfferSharingId.uuid);
	//     conditionStatements.push(`"id" = $${conditionParams.length}`);

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT "id", "offer_ref", "utc_created_at"
	//       FROM "diia_offer_sharing"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSharing = {
	//       diiaOfferSharingId: DiiaOfferSharingIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSharingReference: offerRef,
	//       diiaOfferSharingCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async findDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<DiiaOfferSign | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     conditionParams.push(opts.diiaOfferSignId.uuid);
	//     conditionStatements.push(`"id" = $${conditionParams.length}`);

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT "id", "offer_ref", "utc_created_at"
	//       FROM "diia_offer_sign"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSign = {
	//       diiaOfferSignId: DiiaOfferSignIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSignReference: offerRef,
	//       diiaOfferSignCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async findDiiaOnlineDocRequest(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOnlineDocRequest.Id | DiiaOnlineDocRequest.ClientRequestToken | DiiaOfferSharing.Id,
	//   ): Promise<DiiaOnlineDocRequestWithoutQrCode | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     if ("diiaOnlineDocRequestId" in opts) {
	//       conditionParams.push(opts.diiaOnlineDocRequestId.uuid);
	//       conditionStatements.push(`"id" = $${conditionParams.length}::UUID`);
	//     }

	//     if ("diiaOnlineDocRequestClientRequestToken" in opts) {
	//       conditionParams.push(opts.diiaOnlineDocRequestClientRequestToken);
	//       conditionStatements.push(`"client_request_token" = $${conditionParams.length}::UUID`);
	//     }

	//     if ("diiaOfferSharingId" in opts) {
	//       conditionParams.push(opts.diiaOfferSharingId.uuid);
	//       conditionStatements.push(`"diia_offer_sharing_id" = $${conditionParams.length}::UUID`);
	//     }

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT "id", "diia_offer_sharing_id", "client_request_token", "deeplink",
	//         "document_reference_identifier", "utc_created_at"
	//       FROM "diia_online_doc_request"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//       ORDER BY "utc_created_at" DESC
	//       LIMIT 1
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     return mapDiiaOnlineDocRequests(sqlRecord);
	//   }

	//   public override async findDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts: DiiaSignDocs.Id | DiiaSignDocs.ClientRequestToken | DiiaSignDocs.CallbackToken,
	//   ): Promise<DiiaSignDocsWithoutQrCode | null> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     if ("diiaSignDocsId" in opts) {
	//       conditionParams.push(opts.diiaSignDocsId.uuid);
	//       conditionStatements.push(`"id" = $${conditionParams.length}::UUID`);
	//     }

	//     if ("diiaSignDocsClientRequestToken" in opts) {
	//       conditionParams.push(opts.diiaSignDocsClientRequestToken);
	//       conditionStatements.push(`"client_request_token" = $${conditionParams.length}::UUID`);
	//     }

	//     if ("diiaSignDocsCallbackToken" in opts) {
	//       conditionParams.push(opts.diiaSignDocsCallbackToken);
	//       conditionStatements.push(`"callback_token" = $${conditionParams.length}::UUID`);
	//     }

	//     const sqlRecord: FSqlResultRecord | null = await this.sqlConnection.statement(`
	//       SELECT "id", "diia_offer_sign_id", "client_request_token",
	//         "deeplink", "callback_token", "utc_created_at"
	//       FROM "diia_sign_docs"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingleOrNull(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     if (sqlRecord === null) {
	//       return null;
	//     }

	//     return mapDiiaSignDocs(sqlRecord);
	//   }

	//   public override async findSystemProperty(
	//     executionContext: FExecutionContext,
	//     opts: {
	//       readonly propertyName: string;
	//     },
	//   ): Promise<unknown> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlValue: FSqlData | null = await this.sqlConnection.statement(`
	//       SELECT "value" FROM "system_property" WHERE "name" = $1::TEXT;
	//     `).executeScalarOrNull(
	//       executionContext,
	//       /* 1 */opts.propertyName,
	//     );

	//     if (sqlValue === null) { return null; }

	//     return sqlValue.asObjectNullable;
	//   }

	//   public override async getApplication(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id | Application.DataOrderId | Customer.Id,
	//   ): Promise<Application> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     if ("applicationId" in opts) {
	//       // by "applicationId"
	//       conditionParams.push(opts.applicationId.uuid);
	//       conditionStatements.push(`A."id" = $${conditionParams.length}`);
	//     }
	//     if ("applicationOrderId" in opts) {
	//       // by "applicationOrderId"
	//       conditionParams.push(opts.applicationOrderId);
	//       conditionStatements.push(`A."order_id" = $${conditionParams.length}`);
	//     }
	//     if ("customerId" in opts) {
	//       // by "customerId"
	//       conditionParams.push(opts.customerId.uuid);
	//       conditionStatements.push(`A."rid" = $${conditionParams.length}`);
	//     }

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       SELECT A."id", A."rid", A."order_id", A."return_url", A."data", A."status", A."utc_created_at", A."utc_updated_at", A."ttl_seconds",
	//         AO."amount", AO."currency", AO."parts_count", AO."products"
	//       FROM "application" AS A
	//       INNER JOIN "application_order" AS AO ON AO."application_id" = A."id"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     return mapApplication(sqlRecord, sqlRecord);
	//   }

	//   public override async getApplicationStatus(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id,
	//   ): Promise<Application.Id & Application.DataStatus & Application.InstanceUpdatedAt> {
	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       SELECT A."status", A."utc_updated_at"
	//       FROM "application" AS A
	//       WHERE A."id" = $1
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         opts.applicationId.uuid,
	//       );

	//     const applicationUpdatedAt: Date = sqlRecord.get("utc_updated_at").asDate;
	//     const applicationStatus: string = sqlRecord.get("status").asString;

	//     assertIsApplicationPage(applicationStatus);

	//     const model = {
	//       applicationId: opts.applicationId,
	//       applicationUpdatedAt,
	//       applicationStatus,
	//     };

	//     return Object.freeze<Application.Id & Application.DataStatus & Application.InstanceUpdatedAt>(model);
	//   }

	//   public override async getDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<DiiaOfferSharing> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     conditionParams.push(opts.diiaOfferSharingId.uuid);
	//     conditionStatements.push(`"id" = $${conditionParams.length}`);

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       SELECT "id", "offer_ref", "utc_created_at"
	//       FROM "diia_offer_sharing"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSharing = {
	//       diiaOfferSharingId: DiiaOfferSharingIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSharingReference: offerRef,
	//       diiaOfferSharingCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async getDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<DiiaOfferSign> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     conditionParams.push(opts.diiaOfferSignId.uuid);
	//     conditionStatements.push(`"id" = $${conditionParams.length}`);

	//     const sqlRecord: FSqlResultRecord = await this.sqlConnection.statement(`
	//       SELECT "id", "offer_ref", "utc_created_at"
	//       FROM "diia_offer_sign"
	//       WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}
	//     `)
	//       .executeSingle(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     const diiaOfferDbId: string = sqlRecord.get("id").asString;
	//     // const applicationDbId: string = sqlRecord.get("application_id").asString;
	//     const offerRef: string = sqlRecord.get("offer_ref").asString;
	//     const diiaOfferCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

	//     const diiaOfferModel: DiiaOfferSign = {
	//       diiaOfferSignId: DiiaOfferSignIdentifier.fromUuid(diiaOfferDbId),
	//       applicationId: ApplicationIdentifier.fromUuid(diiaOfferDbId),
	//       diiaOfferSignReference: offerRef,
	//       diiaOfferSignCreatedAt: diiaOfferCreatedAt,
	//     };

	//     return Object.freeze(diiaOfferModel);
	//   }

	//   public override async listDiiaOnlineDocRequests(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<Array<DiiaOnlineDocRequestWithoutQrCode>> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlRows: ReadonlyArray<FSqlResultRecord> = await this.sqlConnection.statement(`
	//       SELECT "id", "diia_offer_sharing_id", "client_request_token", "deeplink",
	//         "document_reference_identifier", "utc_created_at"
	//       FROM "diia_online_doc_request"
	//       WHERE "diia_offer_sharing_id" = $1::UUID
	//       ORDER BY "utc_created_at" DESC
	//     `)
	//       .executeQuery(executionContext,
	//         /* 1 */opts.diiaOfferSharingId.uuid,
	//       );

	//     return sqlRows.map(mapDiiaOnlineDocRequests);
	//   }

	//   public override async listDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<Array<DiiaSignDocsWithoutQrCode>> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlRows: ReadonlyArray<FSqlResultRecord> = await this.sqlConnection.statement(`
	//       SELECT "id", "diia_offer_sign_id", "client_request_token",
	//         "deeplink", "callback_token", "utc_created_at"
	//       FROM "diia_sign_docs"
	//       WHERE "diia_offer_sign_id" = $1::UUID
	//     `)
	//       .executeQuery(executionContext,
	//         /* 1 */opts.diiaOfferSignId.uuid,
	//       );

	//     return sqlRows.map(mapDiiaSignDocs);
	//   }

	//   public override async listDocuments(
	//     executionContext: FExecutionContext,
	//     opts: Document.Id | Application.Id,
	//   ): Promise<Array<Document>> {
	//     super.verifyInitializedAndNotDisposed();

	//     const conditionStatements: Array<string> = [];
	//     const conditionParams: Array<FSqlStatementParam> = [];

	//     if ("applicationId" in opts) {
	//       conditionParams.push(opts.applicationId.uuid);
	//       conditionStatements.push(`"application_id" = $${conditionParams.length}`);
	//     }
	//     if ("documentId" in opts) {
	//       conditionParams.push(opts.documentId.uuid);
	//       conditionStatements.push(`"document_id" = $${conditionParams.length}`);
	//     }
	//     if ("fileId" in opts) {
	//       conditionParams.push(opts.fileId.uuid);
	//       conditionStatements.push(`"file_id" = $${conditionParams.length}`);
	//     }

	//     const whereStatement: string = conditionStatements.length > 0
	//       ? `WHERE ${conditionStatements.map((condition) => `(${condition})`).join(" AND ")}`
	//       : "";

	//     const documents: ReadonlyArray<FSqlResultRecord> = await this.sqlConnection
	//       .statement(`
	//         SELECT "document_id", "file_id", "application_id", "type", "issuer", "title", "file_name", "utc_created_at"
	//         FROM "documentium_doc"
	//         ${whereStatement}
	//       `)
	//       .executeQuery(
	//         executionContext,
	//         ...conditionParams,
	//       );

	//     return documents.map(mapDocument);
	//   }

	public async listVersions(
		executionContext: FExecutionContext,
	): Promise<Array<string>> {
		super.verifyInitializedAndNotDisposed();

		const versionRows: ReadonlyArray<FSqlResultRecord> = await this.sqlConnection
			.statement('SELECT "version" FROM "public"."__migration" ORDER BY "version" DESC')
			.executeQuery(executionContext);
		return versionRows.map(versionRow => versionRow.get("version").asString);
	}

	//   public override async listSystemProperties(
	//     executionContext: FExecutionContext,
	//   ): Promise<Array<[SystemProperty, unknown]>> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlRows = await this.sqlConnection.statement(`
	//       SELECT "name", "value" FROM "system_property";
	//     `).executeQuery(
	//       executionContext,
	//     );

	//     const availableProperties = new Set(Object.values(SystemProperty).map(v => v.toString()));
	//     const result: Array<[SystemProperty, unknown]> = [];
	//     for (const sqlRow of sqlRows) {
	//       const name = sqlRow.get("name").asString;
	//       const value = sqlRow.get("value").asObject;

	//       if (availableProperties.has(name)) {
	//         result.push([name as SystemProperty, value]);
	//       }
	//     }

	//     return result;
	//   }

	//   public override async setApplication(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id & Application.DataStatus & Partial<Customer.Id>,
	//   ): Promise<void> {
	//     super.verifyInitializedAndNotDisposed();

	//     const setParams: Array<FSqlStatementParam> = [];
	//     const setStatements: Array<string> = [];

	//     {
	//       setParams.push(opts.applicationStatus);
	//       setStatements.push(`"status" = $${setParams.length}::TEXT`);
	//     }

	//     if (opts.customerId !== undefined) {
	//       setParams.push(opts.customerId.uuid);
	//       setStatements.push(`"rid" = $${setParams.length}::UUID`);
	//     }

	//     await this.sqlConnection.statement(`
	//       UPDATE "application"
	//       SET ${setStatements.join(', ')}
	//       WHERE "id" = $${setStatements.length + 1}::UUID;
	//     `).execute(
	//       executionContext,
	//       ...setParams,
	//       /* last */opts.applicationId.uuid
	//     );

	//     this.logger.info(executionContext, () =>
	//       `Updated application status: ${opts.applicationStatus}`
	//     );
	//   }

	//   public override async setSystemProperty(
	//     executionContext: FExecutionContext,
	//     opts: {
	//       readonly propertyName: string;
	//       readonly propertyValue: unknown;
	//     },
	//   ): Promise<void> {
	//     super.verifyInitializedAndNotDisposed();

	//     const sqlValue: FSqlData | null = await this.sqlConnection.statement(`
	//       SELECT 1 FROM "system_property" WHERE "name" = $1::TEXT;
	//     `).executeScalarOrNull(
	//       executionContext,
	//       /* 1 */opts.propertyName,
	//     );
	//     if (sqlValue === null) {
	//       await this.sqlConnection.statement(`
	//         INSERT INTO "system_property" ("name", "value") VALUES ($1::TEXT, $2::JSONB);
	//       `).execute(
	//         executionContext,
	//         /* 1 */opts.propertyName,
	//         /* 2 */JSON.stringify(opts.propertyValue)
	//       );
	//     } else {
	//       await this.sqlConnection.statement(`
	//         UPDATE "system_property" SET "value" = $2::JSONB WHERE "name" = $1::TEXT;
	//       `).execute(
	//         executionContext,
	//         /* 1 */opts.propertyName,
	//         /* 2 */JSON.stringify(opts.propertyValue)
	//       );
	//     }
	//   }


	protected static dbInstanceCounter = 0;
}

// function mapApplication(
//   applicationSqlRecord: FSqlResultRecord,
//   applicationOrderSqlRecord: FSqlResultRecord,
// ): Application {
//   const applicationDbId: string = applicationSqlRecord.get("id").asString;
//   const rid: string | null = applicationSqlRecord.get("rid").asStringNullable;
//   const orderUuid: string = applicationSqlRecord.get("order_id").asString;
//   const data: any = applicationSqlRecord.get("data").asObject;
//   const returnUrlStr: string = applicationSqlRecord.get("return_url").asString;
//   const applicationCreatedAt: Date = applicationSqlRecord.get("utc_created_at").asDate;
//   const applicationTtlSeconds: number | null = applicationSqlRecord.get("ttl_seconds").asNumberNullable;
//   const applicationUpdatedAt: Date = applicationSqlRecord.get("utc_updated_at").asDate;
//   const applicationStatus: string = applicationSqlRecord.get("status").asString;
//   const amount: number = applicationOrderSqlRecord.get("amount").asNumber;
//   const currency: string = applicationOrderSqlRecord.get("currency").asString;
//   const partsCount: number = applicationOrderSqlRecord.get("parts_count").asNumber;
//   const products: Array<string> = applicationOrderSqlRecord.get("products").asStringArray;

//   assertIsApplicationPage(applicationStatus);

//   const model: Application = {
//     applicationId: ApplicationIdentifier.fromUuid(applicationDbId),
//     customerId: rid === null ? null : CustomerIdentifier.fromUuid(rid),
//     applicationOrderId: orderUuid,
//     applicationReturnUrl: new URL(returnUrlStr),
//     applicationCreatedAt,
//     applicationUpdatedAt,
//     applicationStatus,
//     applicationTtlSeconds,
//     applicationRawData: data,
//     applicationOrderData: Object.freeze<Application["applicationOrderData"]>({
//       amount,
//       currency,
//       partsCount,
//       products: Object.freeze(products),
//     }),
//   };

//   return Object.freeze<Application>(model);
// }

// function mapApplicationCheckpoint(sqlRecord: FSqlResultRecord): ApplicationCheckpoint {
//   const applicationDbId: string = sqlRecord.get("application_id").asString;
//   const applicationCheckpointKind: ApplicationCheckpoint.Kind = sqlRecord.get("kind").asString as ApplicationCheckpoint.Kind;
//   const applicationCheckpointCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

//   const applicationId: ApplicationIdentifier = ApplicationIdentifier.fromUuid(applicationDbId);

//   switch (applicationCheckpointKind) {
//     case ApplicationCheckpoint.Kind.DOCS_AGREEMENT_READY_TO_SIGN:
//     case ApplicationCheckpoint.Kind.DOCS_AGREEMENT_SIGNED_BY_DIIA:
//     case ApplicationCheckpoint.Kind.DOCS_AUTH_SHARED_BY_DIIA:
//     case ApplicationCheckpoint.Kind.LOAD_APPROVED:
//       break;
//     default:
//       throw new ApplicationCheckpointException(applicationCheckpointKind, applicationId);
//   }

//   const model: ApplicationCheckpoint = {
//     applicationId,
//     applicationCheckpointKind,
//     applicationCheckpointCreatedAt,
//   };

//   return Object.freeze<ApplicationCheckpoint>(model);
// }

// function mapDiiaSignDocs(sqlRecord: FSqlResultRecord): DiiaSignDocsWithoutQrCode {
//   const dbId: string = sqlRecord.get("id").asString;
//   const offerDbId: string = sqlRecord.get("diia_offer_sign_id").asString;
//   const clientRequestToken: string = sqlRecord.get("client_request_token").asString;
//   const callbackToken: string = sqlRecord.get("callback_token").asString;
//   const deepLink: string = sqlRecord.get("deeplink").asString;
//   const createdAt: Date = sqlRecord.get("utc_created_at").asDate;

//   const diiaOnlineDocRequest: DiiaSignDocsWithoutQrCode = {
//     diiaSignDocsId: DiiaSignDocsIdentifier.fromUuid(dbId),
//     diiaOfferSignId: DiiaOfferSignIdentifier.fromUuid(offerDbId),
//     diiaSignDocsClientRequestToken: clientRequestToken,
//     diiaSignDocsCallbackToken: callbackToken,
//     diiaSignDocsDeepLink: new URL(deepLink),
//     // diiaOnlineDocRequestDocumentReferenceIdentifier: documentReferenceIdentifier,
//     diiaSignDocsCreatedAt: createdAt,
//   };

//   return Object.freeze<DiiaSignDocsWithoutQrCode>(diiaOnlineDocRequest);
// }

// function mapDiiaOnlineDocRequests(sqlRecord: FSqlResultRecord): DiiaOnlineDocRequestWithoutQrCode {
//   const diiaOnlineDocRequestDbId: string = sqlRecord.get("id").asString;
//   const diiaOfferDbId: string = sqlRecord.get("diia_offer_sharing_id").asString;
//   const diiaOnlineDocRequestClientRequestToken: string = sqlRecord.get("client_request_token").asString;
//   const diiaOnlineDocRequestDeepLink: URL = new URL(sqlRecord.get("deeplink").asString);
//   const diiaOnlineDocRequestDocumentReferenceIdentifier: string = sqlRecord.get("document_reference_identifier").asString;
//   const diiaOnlineDocRequestCreatedAt: Date = sqlRecord.get("utc_created_at").asDate;

//   const diiaOfferModel: DiiaOnlineDocRequestWithoutQrCode = {
//     diiaOnlineDocRequestId: DiiaOnlineDocRequestIdentifier.fromUuid(diiaOnlineDocRequestDbId),
//     diiaOfferSharingId: DiiaOfferSharingIdentifier.fromUuid(diiaOfferDbId),
//     diiaOnlineDocRequestClientRequestToken,
//     diiaOnlineDocRequestDeepLink,
//     diiaOnlineDocRequestDocumentReferenceIdentifier,
//     diiaOnlineDocRequestCreatedAt,
//   };

//   return Object.freeze<DiiaOnlineDocRequestWithoutQrCode>(diiaOfferModel);
// }

// function mapDocument(sqlRecord: FSqlResultRecord): Document {
//   const documentDbId: string = sqlRecord.get("document_id").asString;
//   const fileDbId: string = sqlRecord.get("file_id").asString;
//   const applicationDbId: string = sqlRecord.get("application_id").asString;
//   const issuerRaw: string = sqlRecord.get("issuer").asString;
//   const typeRaw: string = sqlRecord.get("type").asString;
//   const title: string = sqlRecord.get("title").asString;
//   const fileName: string = sqlRecord.get("file_name").asString;
//   const createdAt: Date = sqlRecord.get("utc_created_at").asDate;

//   const documentId: DocumentIdentifier = DocumentIdentifier.fromUuid(documentDbId);
//   const fileId: FileIdentifier = FileIdentifier.fromUuid(fileDbId);

//   const issuerLike: Document["documentIssuer"] = issuerRaw as Document["documentIssuer"];
//   if (issuerLike !== "ABS" && issuerLike !== "BANK") {
//     throw new UnparsableDocumentIssuerException(issuerLike, documentId, fileId);
//   }

//   const typeLike: Document["documentType"] = typeRaw as Document["documentType"];
//   switch (typeLike) {
//     case "agreement":
//     case "certificate_bank_account":
//     case "payment_instruction_ata":
//     case "questionnaire":
//       break;
//     default:
//       throw new UnparsableDocumentTypeException(typeLike, documentId, fileId);
//   }

//   const document: Document = {
//     documentId,
//     fileId,
//     applicationId: ApplicationIdentifier.fromUuid(applicationDbId),
//     documentIssuer: issuerLike,
//     documentType: typeLike,
//     documentTitle: title,
//     documentFileName: fileName,
//     documentCreatedAt: createdAt,
//   };

//   return Object.freeze<Document>(document);
// }

// class ApplicationCheckpointException extends FException {
//   public constructor(type: never, applicationId: ApplicationIdentifier) {
//     super(`Unable to parse 'type' field value '${type}' of the Application Checkpoint '${applicationId.uuid}/${applicationId.value}'`);
//   }
// }

// class UnparsableDocumentTypeException extends FException {
//   public constructor(type: never, documentId: DocumentIdentifier, fileId: FileIdentifier) {
//     super(`Unable to parse 'type' field value '${type}' of the document '${documentId.uuid}/${documentId.value}' file '${fileId.uuid}/${fileId.value}'`);
//   }
// }

// class UnparsableDocumentIssuerException extends FException {
//   public constructor(issuer: never, documentId: DocumentIdentifier, fileId: FileIdentifier) {
//     super(`Unable to parse 'issuer' field value '${issuer}' of the document '${documentId.uuid}/${documentId.value}' file '${fileId.uuid}/${fileId.value}'`);
//   }
// }
