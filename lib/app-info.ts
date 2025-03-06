import { createRequire } from "module";
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

export const appInfo = (function () {
    const { name, version, build } = packageJson as any;
    const { commit_reference, commit_timestamp,
        // ...rest
    } = build || {};

    return Object.freeze({
        title: name,
        version,
        build: Object.freeze({
            commit: Object.freeze({
                reference: commit_reference,
                timestamp: commit_timestamp,
            }),
            // ...rest,
        }),
    });
})(); 
