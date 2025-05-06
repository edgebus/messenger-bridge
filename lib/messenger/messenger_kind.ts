export const enum MessengerKind {
	SLACK = "slack",
	TELEGRAM = "telegram",
	VIBER = "viber",
}

export const messengerKindMetaMap = Object.freeze({
	[MessengerKind.SLACK]: Object.freeze({
		// TBD
	}),
	[MessengerKind.TELEGRAM]: Object.freeze({
		// TBD
	}),
	[MessengerKind.VIBER]: Object.freeze({
		// TBD
	}),
});

export const allMessengerKinds: ReadonlyArray<MessengerKind> = Object.freeze(Object.values(messengerKindMetaMap) as Array<MessengerKind>);

export function isMessengerKind(value: string | null): value is MessengerKind {
	const friendlyValue: MessengerKind = value as MessengerKind;
	switch (friendlyValue) {
		case MessengerKind.SLACK:
		case MessengerKind.TELEGRAM:
		case MessengerKind.VIBER:
			return true;
		default:
			return guardFalse(friendlyValue);
	}
}

export function assertIsMessengerKind(value: string | null): asserts value is MessengerKind {
	const friendlyValue: MessengerKind = value as MessengerKind;
	if (!isMessengerKind(friendlyValue)) {
		throw new UnreachableApplicationPageError(friendlyValue);
	}
}

export class UnreachableApplicationPageError extends Error {
	public constructor(appPage: never) {
		super(`Unsupported application page value: '${appPage}'`);
	}
}

function guardFalse(_never: never): false { return false; }
