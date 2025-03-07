import cors from "cors";
import express from "express";

import { Settings } from "../../settings.js";

export function createCorsMiddleware(corsSettings: Settings.Cors) {
    const whitelist: ReadonlyArray<string> = corsSettings.whiteList;
    const methods: ReadonlyArray<string> = corsSettings.methods;
    const allowedHeaders: ReadonlyArray<string> = corsSettings.allowedHeaders;

    // logger.info(`Setup CORS whitelist: ${whitelist.join(" ")}`);

    const corsOptionsDelegate: cors.CorsOptionsDelegate = function (req, callback) {
        // see https://www.npmjs.com/package/cors#configuring-cors-asynchronously
        const originHeader: string | undefined = (req as any as express.Request).header("Origin");
        const corsEnabled: boolean = originHeader !== undefined && whitelist.indexOf(originHeader) !== -1;
        const corsOptions: cors.CorsOptions = {
            origin: corsEnabled,
            methods: [...methods],
            allowedHeaders: [...allowedHeaders],
            credentials: true
        };
        callback(null, corsOptions);
    };

    const corsMiddleware = cors(corsOptionsDelegate);

    return corsMiddleware;
}
