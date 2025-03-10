import { FException, FExceptionArgument, FLoggerLevel } from "@freemework/common";

export abstract class LoggerSettings {
	public static fromEnvironmentVariables(): LoggerSettings {
		let { LOG_FORMAT, LOG_LEVEL } = process.env;

		if (LOG_FORMAT === undefined) {
			LOG_FORMAT = 'text';
			console.warn(`LOG_FORMAT variable is not set. Fallback to '${LOG_FORMAT}' value.`);
		}

		if (LOG_LEVEL === undefined) {
			LOG_LEVEL = 'info';
			console.warn(`LOG_LEVEL variable is not set. Fallback to '${LOG_LEVEL}' value.`);
		}

		const logFormat = LOG_FORMAT as LoggerSettings["format"];
		switch (logFormat) {
			case 'json':
			case 'text':
				break;
			default:
				console.error(`Wrong value '${logFormat}' of LOG_FORMAT environment variable.`);
				process.exit(126);
		}

		let logLevel: FLoggerLevel;
		try { logLevel = FLoggerLevel.parse(LOG_LEVEL.toUpperCase()); }
		catch (e) {
			if (e instanceof FExceptionArgument) {
				console.error(`Wrong value '${LOG_LEVEL}' of LOG_LEVEL environment variable.`);
			} else {
				const ex: FException = FException.wrapIfNeeded(e);
				console.error(`Unexpected error while parsing value '${LOG_LEVEL}' of LOG_LEVEL environment variable. ${ex.message}.`);
			}
			process.exit(127);
		}

		class LoggerSettingsImpl extends LoggerSettings {
			public constructor(
				public readonly level: FLoggerLevel,
				public readonly format: 'json' | 'text',
			) { super(); }
		}

		return new LoggerSettingsImpl(logLevel, logFormat);
	}

	public abstract get level(): FLoggerLevel;
	public abstract get format(): 'json' | 'text';
}
