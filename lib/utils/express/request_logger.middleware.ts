import {
    FLogger,
    FLoggerLabelsExecutionContext,
} from "@freemework/common";
import {
    NextFunction,
    Request,
    Response,
} from "express-serve-static-core";

export function createRequestLoggerMiddleware(
    loggerName: string
) {
    const logger: FLogger = FLogger.create(loggerName);

    return function (req: Request, res: Response, next: NextFunction) {
        const method: string = req.method.toUpperCase();

        logger.trace(req.executionContext, "Begin HTTP request");

        const originalEnd: Function = res.end;
        res.end = function () {
            const { statusCode } = res;

            req.executionContext = new FLoggerLabelsExecutionContext(req.executionContext, {
                httpStatus: statusCode.toString(),
            });

            logger.info(
                req.executionContext,
                () => `${statusCode} ${method} ${req.originalUrl} HTTP/${req.httpVersion}`,
            );
            logger.trace(req.executionContext, "End HTTP request");

            return originalEnd.call(this, ...arguments);
        };

        next();
    }
}
