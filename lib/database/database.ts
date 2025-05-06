import { FException, FExecutionContext, FInitableBase } from '@freemework/common';

import {
	Dialog,
	DialogMessage,
} from '../model/index.js';

export abstract class Database extends FInitableBase {

	public abstract createDialog(
		executionContext: FExecutionContext,
		data: Partial<Dialog.Id> & Dialog.Data
	): Promise<Dialog>;

	/**
	 * Add a new dialog message record
	 */
	public abstract createDialogMessage(
		executionContext: FExecutionContext,
		data: Partial<DialogMessage.Id> & DialogMessage.Data,
	): Promise<DialogMessage>;

	//   public abstract createApplicationCheckpoint(
	//     executionContext: FExecutionContext,
	//     opts: ApplicationCheckpoint.Id & ApplicationCheckpoint.Data,
	//   ): Promise<ApplicationCheckpoint>;

	//   public abstract createDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id & DiiaOfferSharing.Data,
	//   ): Promise<DiiaOfferSharing>;

	//   public abstract createDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id & DiiaOfferSign.Data,
	//   ): Promise<DiiaOfferSign>;

	//   public abstract createDiiaOnlineDocRequest(
	//     executionContext: FExecutionContext,
	//     opts:
	//       & DiiaOfferSharing.Id
	//       & Partial<DiiaOnlineDocRequest.Id>
	//       & DiiaOnlineDocRequest.ClientRequestToken
	//       & DiiaOnlineDocRequest.DeepLink
	//       & DiiaOnlineDocRequest.DocumentReference,
	//   ): Promise<DiiaOnlineDocRequestWithoutQrCode>;

	//   public abstract createDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts:
	//       & Partial<DiiaSignDocs.Id>
	//       & DiiaOfferSign.Id
	//       & DiiaSignDocs.ClientRequestToken
	//       & DiiaSignDocs.CallbackToken
	//       & DiiaSignDocs.DeepLink,
	//   ): Promise<DiiaSignDocsWithoutQrCode>;

	//   public abstract createDocument(
	//     executionContext: FExecutionContext,
	//     opts: Partial<Document.Id> & Document.Data,
	//   ): Promise<Document>;

	public abstract findDialog(
		executionContext: FExecutionContext,
		filter: Dialog.Id | Dialog.MessengerChatToken | { activeOnly: true; },
	): Promise<Dialog | null>;

	//   public abstract findApplicationStatusAndReturnURL(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id,
	//   ): Promise<(Application.Id & Application.DataStatus & Application.InstanceUpdatedAt & Application.DataReturnURL) | null>;

	//   public abstract findApplicationCheckpoint(
	//     executionContext: FExecutionContext,
	//     opts: ApplicationCheckpoint.Id,
	//   ): Promise<ApplicationCheckpoint | null>;

	//   public abstract findApplicationExpirationCandidates(
	//     executionContext: FExecutionContext,
	//     expirationTimeoutSeconds: number,
	//   ): Promise<Array<Application.Id & Application.DataOrderId>>;

	//   public abstract findDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<DiiaOfferSharing | null>;

	//   public abstract findDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<DiiaOfferSign | null>;

	//   public abstract findDiiaOnlineDocRequest(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOnlineDocRequest.Id | DiiaOnlineDocRequest.ClientRequestToken | DiiaOfferSharing.Id,
	//   ): Promise<DiiaOnlineDocRequestWithoutQrCode | null>;

	//   public abstract findDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts: DiiaSignDocs.Id | DiiaSignDocs.CallbackToken,
	//   ): Promise<DiiaSignDocsWithoutQrCode | null>;

	//   public abstract findSystemProperty(
	//     executionContext: FExecutionContext,
	//     opts: {
	//       readonly propertyName: SystemProperty;
	//     },
	//   ): Promise<unknown>;

	//   public abstract getApplication(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id,
	//   ): Promise<Application>;

	//   public abstract getApplicationStatus(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id,
	//   ): Promise<Application.Id & Application.DataStatus & Application.InstanceUpdatedAt>;

	//   public abstract getDiiaOfferSharing(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<DiiaOfferSharing>;

	//   public abstract getDiiaOfferSign(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<DiiaOfferSign>;

	//   public abstract listDiiaOnlineDocRequests(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSharing.Id,
	//   ): Promise<Array<DiiaOnlineDocRequestWithoutQrCode>>;

	//   public abstract listDiiaSignDocs(
	//     executionContext: FExecutionContext,
	//     opts: DiiaOfferSign.Id,
	//   ): Promise<Array<DiiaSignDocsWithoutQrCode>>;

	// public abstract listDialogs(
	// 	executionContext: FExecutionContext,
	// 	opts: Partial<Dialog.Data>,
	// ): Promise<Array<Dialog>>;

	//   public abstract listDocuments(
	//     executionContext: FExecutionContext,
	//     opts: Document.Id | Application.Id,
	//   ): Promise<Array<Document>>;

	//   public abstract listSystemProperties(
	//     executionContext: FExecutionContext,
	//   ): Promise<Array<[SystemProperty, unknown]>>;


	public abstract getDialogMessage(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id,
	): Promise<DialogMessage>;

	public abstract listDialogMessage(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id | Dialog.Id | { isProcessed: boolean },
		opts: {
			readonly limit?: number;
		}
	): Promise<Array<DialogMessage>>;

	public abstract listVersions(
		executionContext: FExecutionContext,
	): Promise<Array<string>>;


	//   public abstract setApplication(
	//     executionContext: FExecutionContext,
	//     opts: Application.Id & Application.DataStatus & Partial<Customer.Id>,
	//   ): Promise<void>;

	//   public abstract setSystemProperty(
	//     executionContext: FExecutionContext,
	//     opts: {
	//       readonly propertyName: SystemProperty;
	//       readonly propertyValue: unknown;
	//     },
	//   ): Promise<void>;

	/**
	 * Update dialog message record for set IsProcessed to `true`
	 */
	public abstract markDialogMessageAsProcessed(
		executionContext: FExecutionContext,
		filter: DialogMessage.Id,
	): Promise<void>;


	public abstract transactionCommit(executionContext: FExecutionContext): Promise<void>;
	public abstract transactionRollback(executionContext: FExecutionContext): Promise<void>;
}

export abstract class DatabaseException extends FException { }
// export class DatabaseInternalBugException extends DatabaseException { }
