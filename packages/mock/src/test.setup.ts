// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextDecoder, TextEncoder } from 'node:util';
import { vi } from 'vitest';

// MockSubscriptionManager extends core SubscriptionManager, which starts background
// timers when the WebSocket opens: one refreshes subscription tokens on
// WS_SUB_TOKEN_REFRESH_INTERVAL_MS, and both it and the ping timer call
// gcUnrefEntries(), which finalizes criteria whose refCount has been 0 for
// UNREF_GRACE_PERIOD_MS. Production defaults (60s / 10s) make tests that
// exercise subscribe/unsubscribe or token refresh slow and timing-sensitive.
// Shorten both intervals globally so this package's subscription tests stay
// fast and deterministic without per-file vi.mock overrides.
vi.mock('@medplum/core/subscriptions/constants', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    WS_SUB_TOKEN_REFRESH_INTERVAL_MS: 150,
    UNREF_GRACE_PERIOD_MS: 50,
  };
});

if (typeof globalThis.window !== 'undefined') {
  Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
  Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
}
