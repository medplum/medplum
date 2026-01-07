// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TypedEventTarget } from '@medplum/core';
import type { MedplumServerConfig } from './config/types';

export type HeartbeatEventMap = {
  heartbeat: { type: 'heartbeat' };
};

export const heartbeat = new TypedEventTarget<HeartbeatEventMap>();
const HEARTBEAT_EVENT = Object.freeze({ type: 'heartbeat' });

let heartbeatTimer: NodeJS.Timeout | undefined;
export const DEFAULT_HEARTBEAT_MS = 10 * 1000;

/**
 * Initializes heartbeat timers for WebSocket connections.
 * @param config - Medplum server config.
 */
export function initHeartbeat(config: MedplumServerConfig): void {
  if (config.heartbeatEnabled === false) {
    return;
  }
  heartbeatTimer ??= setInterval(
    () => heartbeat.dispatchEvent(HEARTBEAT_EVENT),
    config.heartbeatMilliseconds ?? DEFAULT_HEARTBEAT_MS
  );
}

/**
 * Cleans up heartbeat timers for WebSocket connections.
 */
export function cleanupHeartbeat(): void {
  clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
}
