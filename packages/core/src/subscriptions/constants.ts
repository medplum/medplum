// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_PING_INTERVAL_MS = 5_000;

// WebSocket subscription token refresh constants
export const WS_SUB_TOKEN_EXPIRY_GRACE_PERIOD_MS = 5 * 60 * 1000;
export const WS_SUB_TOKEN_REFRESH_INTERVAL_MS = 60_000;

// Grace period after a criteria entry's refCount drops to 0 before it is garbage-collected
// (unbound from the server and removed from local tracking). Re-subscribing within this
// window rescues the entry, avoiding unnecessary unbind/rebind churn.
export const UNREF_GRACE_PERIOD_MS = 10_000;
