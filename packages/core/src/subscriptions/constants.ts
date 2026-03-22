// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_PING_INTERVAL_MS = 5_000;

// WebSocket subscription token refresh constants
export const WS_SUB_TOKEN_EXPIRY_GRACE_PERIOD_MS = 5 * 60 * 1000;
export const WS_SUB_TOKEN_REFRESH_INTERVAL_MS = 60_000;

// Grace period before a removed criteria entry is actually unbound from the WebSocket.
// During this window, re-subscribing to the same criteria + props restores the entry
// and cancels the pending unbind, avoiding unnecessary unbind/rebind churn.
export const PENDING_UNBIND_DELAY_MS = 10_000;
