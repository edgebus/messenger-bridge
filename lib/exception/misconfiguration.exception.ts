import { ApplicationException } from "./application.exception.js";

/**
 * Критическая ошибка в конфигурации сервиса
 */
export class MisconfigurationException extends ApplicationException {
    public constructor(message: string) {
        super(`CRITICAL MISCONFIGURATION DETECTED. ${message}`);
    }
}
