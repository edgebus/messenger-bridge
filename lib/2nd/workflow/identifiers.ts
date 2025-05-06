import { FExceptionArgument, FExceptionInvalidOperation } from "@freemework/common";
import {
	v4 as uuidV4,
	stringify as uuidStringify,
} from "uuid";

export abstract class Identifier {
	public abstract get prefix(): IdentifierPrefix;
	public get value(): string {
		const value: string = this.uuid.split('-').join('');
		return `${this.prefix}${value}`;
	}
	public get uuid(): string {
		return this._uuid;
	}
	public toJSON(): string {
		return this.value;
	}
	public toString(): string {
		return this.value;
	}

	protected static create<T extends Identifier>(
		identifierCls: { new(uuid?: string): T; prototype: T },
		uuid?: string,
	): T {
		const instanceUuid: string = uuid ?? uuidV4();
		const instanceKey: string = Identifier.makeInstanceKey(identifierCls, instanceUuid);
		const ref: WeakRef<Identifier> | undefined = Identifier._weakRefIds.get(instanceKey);
		if (ref !== undefined) {
			const existingInstance = ref.deref();
			if (existingInstance !== undefined) {
				return existingInstance as T;
			}
			Identifier._weakRefIds.delete(instanceKey);
		}

		return new identifierCls(instanceUuid);
	}

	protected static unwrapUuid(id: string, expectedPrefix: IdentifierPrefix): Identifier['uuid'] {
		if (id.length !== 36) {
			throw new FExceptionArgument(`Wrong id value: ${id}. Expected 36 symbols`, 'id');
		}

		const prefix: string = id.substring(0, 4);

		if (expectedPrefix !== prefix) {
			throw new FExceptionArgument(
				`Bad identifier '${id}'. Expected prefix '${expectedPrefix}', but got '${prefix}'.`,
				'id',
			);
		}

		const uuidHexStr: string = id.substring(4);
		const uuidBinary: Buffer = Buffer.from(uuidHexStr, 'hex');
		if (uuidBinary.length !== 16) {
			throw new FExceptionArgument('id', `Wrong id value: ${id}. Expected 16 bytes hex-string`);
		}

		const uuidStr: string = uuidStringify(uuidBinary, 0);

		return uuidStr;
	}

	protected constructor(uuid?: string) {
		// TODO:
		// do not call cleanup(), probably better via setTimeout
		// There are a problem with initialization of large amount of identifiers
		// at small time (for example read 10k+ records from DB)
		Identifier.cleanup(); // Cleanup weak reference

		this._uuid = uuid ?? uuidV4();
		const instanceKey: string = Identifier.makeInstanceKey(
			this.constructor,
			this._uuid
		);
		if (Identifier._weakRefIds.has(instanceKey)) {
			throw new FExceptionInvalidOperation('Internal violation. Contact to developers of the class.');
		}
		Identifier._weakRefIds.set(instanceKey, new WeakRef(this));
	}

	private static cleanup(): void {
		let releasedIdsCount = 0;
		for (const [uuid, idRef] of Identifier._weakRefIds.entries()) {
			const id: Identifier | undefined = idRef.deref();
			if (id !== undefined) {
				// This id is used, move next...
				continue;
			}

			Identifier._weakRefIds.delete(uuid); // cleanup

			if (++releasedIdsCount === 2) {
				// Prevent high load.
				// To make O(1) we just cleanup first 2 ids.
				// It is enough to prevent growing _weakRefIds
				return;
			}
		}
	}

	private static makeInstanceKey(
		identifierCls: Function,
		uuid?: string,
	): string {
		const instanceKey: string = `${identifierCls.name}:${uuid}`;
		return instanceKey;
	}

	private readonly _uuid: string;

	private static readonly _weakRefIds: Map<string, WeakRef<Identifier>> = new Map();
}

export const enum IdentifierPrefix {
	ACTIVITY = "actv",
	WORKFLOW = "wflo",
	WORKFLOW_TICK = "wftk",
}

export abstract class ActivityIdentifier extends Identifier {
	public static generate(): ActivityIdentifier { return new ActivityIdentifierImpl(); }
	public static fromUuid(uuid: string): ActivityIdentifier { return Identifier.create(ActivityIdentifierImpl, uuid); }
	public static parse(id: string): ActivityIdentifier { return Identifier.create(ActivityIdentifierImpl, Identifier.unwrapUuid(id, IdentifierPrefix.ACTIVITY)); }
	public get prefix(): IdentifierPrefix.ACTIVITY { return IdentifierPrefix.ACTIVITY; }
}
class ActivityIdentifierImpl extends ActivityIdentifier {
	public constructor(uuid?: string) { super(uuid); }
}

export abstract class WorkflowIdentifier extends Identifier {
	public static generate(): WorkflowIdentifier { return new WorkflowIdentifierImpl(); }
	public static fromUuid(uuid: string): WorkflowIdentifier { return Identifier.create(WorkflowIdentifierImpl, uuid); }
	public static parse(id: string): WorkflowIdentifier { return Identifier.create(WorkflowIdentifierImpl, Identifier.unwrapUuid(id, IdentifierPrefix.WORKFLOW)); }
	public get prefix(): IdentifierPrefix.WORKFLOW { return IdentifierPrefix.WORKFLOW; }
}
class WorkflowIdentifierImpl extends WorkflowIdentifier {
	public constructor(uuid?: string) { super(uuid); }
}

export abstract class WorkflowTickIdentifier extends Identifier {
	public static generate(): WorkflowTickIdentifier { return new WorkflowTickIdentifierImpl(); }
	public static fromUuid(uuid: string): WorkflowTickIdentifier { return Identifier.create(WorkflowTickIdentifierImpl, uuid); }
	public static parse(id: string): WorkflowTickIdentifier { return Identifier.create(WorkflowTickIdentifierImpl, Identifier.unwrapUuid(id, IdentifierPrefix.WORKFLOW_TICK)); }
	public get prefix(): IdentifierPrefix.WORKFLOW_TICK { return IdentifierPrefix.WORKFLOW_TICK; }
}
class WorkflowTickIdentifierImpl extends WorkflowTickIdentifier {
	public constructor(uuid?: string) { super(uuid); }
}
