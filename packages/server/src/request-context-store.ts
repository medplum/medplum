// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Logger } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';
import { FhirRateLimiter } from './fhir/fhirquota';

export interface IRequestContext extends Disposable {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;
  readonly fhirRateLimiter?: FhirRateLimiter;
}

export const requestContextStore = new AsyncLocalStorage<IRequestContext>();
