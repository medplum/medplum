import { TypedEventTarget } from '@medplum/core';
import { MedplumServerConfig } from './config';

export type HeartbeatEventMap = {
  heartbeat: { type: 'heartbeat' };
};

export const heartbeat = new TypedEventTarget<HeartbeatEventMap>();

export const DEFAULT_HEARTBEAT_MS = 10 * 1000;

let heartbeatTimer: NodeJS.Timeout | undefined;

/**
 * Initializes heartbeat timers for WebSocket connections.
 * @param config - Medplum server config.
 */
export function initHeartbeat(config: MedplumServerConfig): void {
  if (!(config.heartbeatEnabled ?? true)) {
    return;
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(
      () => heartbeat.dispatchEvent({ type: 'heartbeat' }),
      config.heartbeatMilliseconds ?? DEFAULT_HEARTBEAT_MS
    );
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
