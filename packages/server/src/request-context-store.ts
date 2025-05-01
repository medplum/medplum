import { Logger } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';
import { FhirRateLimiter } from './fhirinteractionlimit';

export interface IRequestContext extends Disposable {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;
  readonly fhirRateLimiter?: FhirRateLimiter;
}

export const requestContextStore = new AsyncLocalStorage<IRequestContext>();
