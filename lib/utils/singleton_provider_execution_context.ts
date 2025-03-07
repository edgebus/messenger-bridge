import { FExceptionInvalidOperation, FExecutionContext, FExecutionContextBase, FExecutionElement } from "@freemework/common";

export class SingletonProviderExecutionContext<T> extends FExecutionContextBase {
    private readonly _instance: T;
    private readonly _type: Function & { prototype: T; };

    public static of<T>(executionContext: FExecutionContext, type: Function & { prototype: T; }): SingletonProviderExecutionElement<T> {
        while (true) {
            const providerExecutionContext: SingletonProviderExecutionContext<any> | null
                = FExecutionContext.findExecutionContext(
                    executionContext,
                    SingletonProviderExecutionContext,
                );

            if (providerExecutionContext === null || providerExecutionContext.prevContext === null) {
                throw new FExceptionInvalidOperation(
                    `Execution context '${SingletonProviderExecutionContext.name}' for type '${type.name}' is not presented on the chain.`
                );
            }

            if (providerExecutionContext._type === type) {
                return new SingletonProviderExecutionElement<T, SingletonProviderExecutionContext<T>>(providerExecutionContext, providerExecutionContext._instance);
            }

            executionContext = providerExecutionContext.prevContext;
        }
    }

    public constructor(prevContext: FExecutionContext, type: Function & { prototype: T; }, instance: T) {
        super(prevContext);
        this._type = type;
        this._instance = instance;
    }
}
export class SingletonProviderExecutionElement<T,
    TExecutionContext extends SingletonProviderExecutionContext<T> = SingletonProviderExecutionContext<T>,
> extends FExecutionElement<TExecutionContext> {
    public constructor(
        owner: TExecutionContext,
        public readonly instance: T
    ) {
        super(owner);
    }
}
