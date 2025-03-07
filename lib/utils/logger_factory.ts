import {
	FException,
	FLogger,
	FLoggerBase,
	FLoggerConsole,
	FLoggerLabels,
	FLoggerLevel,
} from "@freemework/common";

import { Mutable } from "./typescript.utils";

function buildLoggerLevelsMap(level: FLoggerLevel | null): Map<FLoggerLevel, boolean> {
	const levels: Map<FLoggerLevel, boolean> = new Map();
	levels.set(FLoggerLevel.FATAL, level != null && level >= FLoggerLevel.FATAL);
	levels.set(FLoggerLevel.ERROR, level != null && level >= FLoggerLevel.ERROR);
	levels.set(FLoggerLevel.WARN, level != null && level >= FLoggerLevel.WARN);
	levels.set(FLoggerLevel.INFO, level != null && level >= FLoggerLevel.INFO);
	levels.set(FLoggerLevel.DEBUG, level != null && level >= FLoggerLevel.DEBUG);
	levels.set(FLoggerLevel.TRACE, level != null && level >= FLoggerLevel.TRACE);
	return levels;
}

interface ElasticFriendlyLogEntryBase {
	readonly [label: string]: string;
	readonly name: string;
	readonly date: string;
	readonly level: string;
	readonly message: string;
}
interface ElasticFriendlyLogEntryWithException extends ElasticFriendlyLogEntryBase {
	// eslint-disable-next-line sonarjs/no-duplicate-string
	readonly 'exception.name': string;
	// eslint-disable-next-line sonarjs/no-duplicate-string
	readonly 'exception.message': string;
}

type ElasticFriendlyLogEntry = ElasticFriendlyLogEntryBase | ElasticFriendlyLogEntryWithException;

abstract class FLoggerBaseWithLevel extends FLoggerBase {
	protected readonly levels: Map<FLoggerLevel, boolean>;

	public constructor(loggerName: string, level: FLoggerLevel) {
		super(loggerName);

		// eslint-disable-next-line func-names
		const specificLogLevel: FLoggerLevel | null = (function () {
			const logLevelEnvironmentKey = `LOG_LEVEL_${loggerName}`;
			if (logLevelEnvironmentKey in process.env) {
				const specificLogLevelStr = process.env[logLevelEnvironmentKey];
				if (specificLogLevelStr !== undefined) {
					try {
						return FLoggerLevel.parse(specificLogLevelStr.toUpperCase());
					} catch (e) {
						console.error(`Unable to parse a value of environment variable '${logLevelEnvironmentKey}'.`);
					}
				}
			}
			return null;
		})();

		this.levels = buildLoggerLevelsMap(specificLogLevel !== null ? specificLogLevel : level);
	}

	protected isLevelEnabled(level: FLoggerLevel): boolean {
		const isEnabled: boolean | undefined = this.levels.get(level);
		return isEnabled === true;
	}
}

// FLoggerElasticFriendlyJsonLoggerViaNestConsole
class FLoggerElasticFriendlyJsonViaConsole extends FLoggerBaseWithLevel {
	public static formatElasticMessage(
		loggerName: string,
		level: FLoggerLevel,
		labels: FLoggerLabels,
		message: string,
		exception?: FException | null,
	): string {
		const logEntryBase: Pick<ElasticFriendlyLogEntry, 'name' | 'date' | 'level'> = {
			name: loggerName,
			date: new Date().toISOString(),
			level: level.toString(),
		};

		const labelsObj: { [label: string]: string } = {};
		// eslint-disable-next-line no-restricted-syntax
		for (const [labelName, labelValue] of Object.entries(labels)) {
			labelsObj[`label.${labelName}`] = labelValue;
		}

		const logEntry: Mutable<ElasticFriendlyLogEntry> = {
			...logEntryBase,
			...labelsObj,
			message,
		};
		if (exception !== undefined && exception != null) {
			logEntry['exception.name'] = exception.name;
			logEntry['exception.message'] = exception.message;
			if (exception.stack !== undefined) {
				logEntry['exception.stack'] = exception.stack;
			}
		}

		const logMessage: string = JSON.stringify(logEntry);

		return logMessage;
	}

	protected log(level: FLoggerLevel, labels: FLoggerLabels, message: string, exception?: FException): void {
		const logMessage: string = FLoggerElasticFriendlyJsonViaConsole.formatElasticMessage(
			this.name,
			level,
			labels,
			message,
			exception,
		);
		switch (level) {
			case FLoggerLevel.TRACE:
			case FLoggerLevel.DEBUG:
				console.debug(logMessage);
				break;
			case FLoggerLevel.INFO:
				console.log(logMessage);
				break;
			case FLoggerLevel.WARN:
			case FLoggerLevel.ERROR:
			case FLoggerLevel.FATAL:
				console.error(logMessage);
				break;
		}
	}
}

export function createLoggerFactory(logLevel: FLoggerLevel, format: 'json' | 'text'): (loggerName: string) => FLogger {
	const factory = (loggerName: string) =>
		format === 'json'
			? new FLoggerElasticFriendlyJsonViaConsole(loggerName, logLevel)
			: FLoggerConsole.create(loggerName, { level: logLevel, format: "text" });
	;
	return factory;
}
