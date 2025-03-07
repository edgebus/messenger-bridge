import {
    FCancellationException,
    FCancellationExecutionContext,
    FCancellationToken,
    FException,
    FExceptionAggregate,
    FExecutionContext,
    FLoggerLabelsExecutionContext,
} from "@freemework/common";
import {
    NextFunction,
    Request,
    Response,
} from "express-serve-static-core";
import { v4 as uuid } from "uuid";

declare module "express-serve-static-core" {
    interface Request {
        executionContext: FExecutionContext;
    }
}

/**
 * Reference implementation https://github.com/freemework/freemework/blob/b7680e03b9081b654cc1c4cf39c2def704dd7471/src/FHttpRequestCancellationToken.ts
 */
class HttpRequestCancellationToken implements FCancellationToken {
    private readonly _onClientDisconnectBound: () => void;

    private readonly _cancelListeners: Array<Function> = [];

    private readonly _request: Request;

    private _isCancellationRequested: boolean;

    public constructor(request: Request) {
        this._isCancellationRequested = false;
        this._onClientDisconnectBound = this._onClientDisconnect.bind(this);
        this._request = request;
        // According to https://nodejs.org/api/http.html
        // v16.0.0	The close event is now emitted when the request has been completed and not when the underlying socket is closed.
        //
        // So We switch to listen "close" event on underlying socket
        this._request.socket.on('close', this._onClientDisconnectBound);
        // this._request.on("end", this._onClientDisconnectBound);
    }

    public get isCancellationRequested(): boolean {
        return this._isCancellationRequested;
    }

    public addCancelListener(cb: Function): void {
        this._cancelListeners.push(cb);
    }

    public removeCancelListener(cb: Function): void {
        const cbIndex = this._cancelListeners.indexOf(cb);
        if (cbIndex !== -1) {
            this._cancelListeners.splice(cbIndex, 1);
        }
    }

    public throwIfCancellationRequested(): void {
        if (this.isCancellationRequested) {
            throw new FCancellationException();
        }
    }

    private _onClientDisconnect() {
        this._request.socket.removeListener('close', this._onClientDisconnectBound);
        // this._request.removeListener("end", this._onClientDisconnectBound);

        this._isCancellationRequested = true;

        const errors: Array<FException> = [];
        if (this._cancelListeners.length > 0) {
            // Release callback. We do not need its anymore
            const cancelListeners = this._cancelListeners.splice(0);
            for (const cancelListener of cancelListeners) {
                try {
                    cancelListener();
                } catch (e) {
                    errors.push(FException.wrapIfNeeded(e));
                }
            }
        }
        FExceptionAggregate.throwIfNeeded(errors);
    }
}

export function createExecutionContextMiddleware(
) {
    return function (req: Request, res: Response, next: NextFunction) {
        const cancellationToken: FCancellationToken = new HttpRequestCancellationToken(req);

        const method: string = req.method.toUpperCase();

        req.executionContext = FExecutionContext.Default;
        req.executionContext = new FCancellationExecutionContext(req.executionContext, cancellationToken, true);
        req.executionContext = new FLoggerLabelsExecutionContext(req.executionContext, {
            requestId: `req_${uuid().split('-').join('')}`,
            httpMethod: method,
            httpPath: req.originalUrl,
        });

        const originalEnd: Function = res.end;
        res.end = function () {
            const { statusCode } = res;

            req.executionContext = new FLoggerLabelsExecutionContext(req.executionContext, {
                httpStatus: statusCode.toString(),
            });

            return originalEnd.call(this, ...arguments);
        };

        next();
    }
}
