import { FExceptionArgument, FExceptionInvalidOperation } from "@freemework/common";
import {
	v4 as uuidV4,
	stringify as uuidStringify,
} from "uuid";

/**
 * Base class for model's identifier
 *
 * We want to use script equality between identifiers to use it as key in native Set and Map.
 * JS does not provide possibility to implement object equality (to be used in native Set, Map, etc.)
 * Our solution is identifier objects cache to provide unique id object by uuid.
 *
 * Another possible implementation (for future refactoring) may be based on proposal-record-tuple
 * See https://tc39.es/proposal-record-tuple/
 *
 * @example
 * const someMap = new Map();
 * const id: Identifier = ResourceIdentifier.parse(req.body.resourceId);
 * someMap.set(id, "some data keyed by id");
 * ...
 * // later
 * const id: Identifier = ResourceIdentifier.parse(req.body.resourceId);
 * const data = someMap.get(id); // data = "some data keyed by id"
 *
 * @example
 * //
 * // Recommended implementation of identifier
 * //
 * export abstract class MyIdentifier extends Identifier {
 *    public static generate(): MyIdentifier { return new MyIdentifierImpl(); }
 *    public static fromUuid(uuid: string): MyIdentifier { return Identifier.create(MyIdentifierImpl, uuid); }
 *    public static parse(id: string): MyIdentifier { return this.fromUuid(Identifier.unwrapUuid(id, IdentifierPrefix.MY)); }
 *    public get prefix(): IdentifierPrefix.MY { return IdentifierPrefix.MY; }
 * }
 * class MyIdentifierImpl extends MyIdentifier {
 *    public constructor(uuid?: string) { super(uuid); }
 * }
 */
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
	// ACTIVITY = "actv",
	DIALOG = "diag",
	DIALOG_MESSAGE = "dlgm",
	// WORKFLOW = "wflo",
}

export class DialogIdentifier extends Identifier {
	public static generate(): DialogIdentifier { return new DialogIdentifierImpl(); }
	public static fromUuid(uuid: string): DialogIdentifier { return Identifier.create(DialogIdentifierImpl, uuid); }
	public static parse(id: string): DialogIdentifier { return this.fromUuid(Identifier.unwrapUuid(id, IdentifierPrefix.DIALOG)); }
	public override get prefix(): IdentifierPrefix.DIALOG { return IdentifierPrefix.DIALOG; }
}
class DialogIdentifierImpl extends DialogIdentifier {
	public constructor(uuid?: string) { super(uuid); }
}


export class DialogMessageIdentifier extends Identifier {
	public static generate(): DialogMessageIdentifier { return new DialogMessageIdentifierImpl(); }
	public static fromUuid(uuid: string): DialogMessageIdentifier { return Identifier.create(DialogMessageIdentifierImpl, uuid); }
	public static parse(id: string): DialogMessageIdentifier { return this.fromUuid(Identifier.unwrapUuid(id, IdentifierPrefix.DIALOG_MESSAGE)); }
	public override get prefix(): IdentifierPrefix.DIALOG_MESSAGE { return IdentifierPrefix.DIALOG_MESSAGE; }
}
class DialogMessageIdentifierImpl extends DialogMessageIdentifier {
	public constructor(uuid?: string) { super(uuid); }
}
