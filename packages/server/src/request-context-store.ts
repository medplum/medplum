// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@medplum/core';
import { AsyncLocalStorage } from 'async_hooks';
import type { FhirRateLimiter } from './fhir/fhirquota';
import type { AuthState } from './oauth/middleware';

export interface IRequestContext extends Disposable {
  readonly requestId: string;
  readonly traceId: string;
  readonly logger: Logger;
  readonly fhirRateLimiter?: FhirRateLimiter;
  readonly authState?: AuthState;
}

export const requestContextStore = new AsyncLocalStorage<IRequestContext>();
