// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export const RETRY_WAIT_DURATION_MS = 10_000;
export const DEFAULT_PING_TIMEOUT = 3_600;
export const DEFAULT_LOG_LIMIT = 20;
export const MAX_LOG_LIMIT = 1000;
export const MAX_MISSED_HEARTBEATS = 1;
export const DEFAULT_MAX_CLIENTS_PER_REMOTE = 5;
export const CLIENT_RELEASE_COUNTDOWN_MS = 10_000;
export const HEARTBEAT_PERIOD_MS = 10_000;

/**
 * Status polling interval for secondary agents in auto-failover mode.
 * Secondary agents poll the Agent/$status endpoint every 5 seconds to check if the primary has disconnected.
 */
export const STATUS_POLL_INTERVAL_MS = 5 * 1000;

/**
 * Time threshold for determining if a primary agent has disconnected.
 * If the last heartbeat is older than this threshold, the secondary agent will promote itself to primary.
 * This should be greater than the heartbeat period to account for network delays.
 */
export const PRIMARY_DISCONNECT_THRESHOLD_MS = 20 * 1000;
