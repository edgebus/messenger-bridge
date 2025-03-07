export interface LoggerSettings {
  readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly logFormat: 'json' | 'text';
}

export function createLoggerSettings(): LoggerSettings {
  let { LOG_FORMAT, LOG_LEVEL } = process.env;

  if (LOG_FORMAT === undefined) {
    LOG_FORMAT = 'text';
    console.error(`LOG_FORMAT variable is not set. Fallback to '${LOG_FORMAT}' value.`);
  }

  if (LOG_LEVEL === undefined) {
    LOG_LEVEL = 'info';
    console.error(`LOG_LEVEL variable is not set. Fallback to '${LOG_LEVEL}' value.`);
  }

  const logFormat = LOG_FORMAT as LoggerSettings['logFormat'];
  switch (logFormat) {
    case 'json':
    case 'text':
      break;
    default:
      console.error(`Wrong value '${logFormat}' of LOG_FORMAT environment variable.`);
      process.exit(126);
  }

  const logLevel = LOG_LEVEL as LoggerSettings['logLevel'];
  switch (logLevel) {
    case 'trace':
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
    case 'fatal':
      break;
    default:
      console.error(`Wrong value '${logLevel}' of LOG_LEVEL environment variable.`);
      process.exit(127);
  }

  return Object.freeze<LoggerSettings>({ logFormat, logLevel });
}
