import { TypedEventTarget } from '@medplum/core';

export type HeartbeatEventMap = {
  heartbeat: { type: 'heartbeat' };
};

export const heartbeat = new TypedEventTarget<HeartbeatEventMap>();

export const DEFAULT_HEARTBEAT_MS = 10 * 1000;

let heartbeatTimer: NodeJS.Timeout | undefined;

/**
 * Initializes heartbeat timers for WebSocket connections.
 */
export function initHeartbeat(): void {
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => heartbeat.dispatchEvent({ type: 'heartbeat' }), DEFAULT_HEARTBEAT_MS);
  }
}

/**
 * Cleans up heartbeat timers for WebSocket connections.
 */
export function cleanupHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}
