import 'reflect-metadata';

import { FException } from '@freemework/common';

export class BugDetectedError extends FException {
  public constructor(message: string, innerError?: any) {
    super(`[BUG Detected] ${message}`, innerError);
  }
}
