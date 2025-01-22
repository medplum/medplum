import { Logger } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;

  close(): void;
}

export const requestContextStore = new AsyncLocalStorage<IRequestContext>();
