import { Logger } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext extends Disposable {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;
}

export const requestContextStore = new AsyncLocalStorage<IRequestContext>();
