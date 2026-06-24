// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextDecoder, TextEncoder } from 'node:util';
import { vi } from 'vitest';
import { MemoryStorage } from './storage';
import type * as SubscriptionConstants from './subscriptions/constants';

// Shorten GC and token-refresh intervals for subscription tests.
vi.mock('./subscriptions/constants', async (importOriginal) => {
  const mod = await importOriginal<typeof SubscriptionConstants>();
  return {
    ...mod,
    WS_SUB_TOKEN_REFRESH_INTERVAL_MS: 150,
    UNREF_GRACE_PERIOD_MS: 50,
  };
});

Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
