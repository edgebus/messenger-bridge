
export class MessengerDialogChooseVariant {
	//
}

export class MessengerDialogChooseVariantGroup extends MessengerDialogChooseVariant {
	private readonly _children: ReadonlyArray<MessengerDialogChooseVariant>;

	public constructor(children: Array<MessengerDialogChooseVariant>) {
		super();
		this._children = Object.freeze([...children]);
	}

	public get children(): ReadonlyArray<MessengerDialogChooseVariant> {
		return this._children;
	}
}

export class MessengerDialogChooseVariantText extends MessengerDialogChooseVariant {
	private readonly _text: string;

	//
	public constructor(text: string) {
		super();
		this._text = text;
	}

	public get text(): string {
		return this._text;
	}
}
