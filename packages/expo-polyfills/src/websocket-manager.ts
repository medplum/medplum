import { MedplumClient } from '@medplum/core';
import { AppState, AppStateStatus } from 'react-native';

let previousState: AppStateStatus = 'unknown';

export function initWebSocketManager(medplum: MedplumClient): void {
  previousState = AppState.currentState;
  AppState.addEventListener('change', (nextState) => {
    const ws = medplum.getSubscriptionManager().getWebSocket();
    if (previousState === 'active' && nextState !== 'active') {
      ws.close();
    } else if (
      previousState !== 'active' &&
      nextState === 'active' &&
      ws.readyState !== WebSocket.OPEN &&
      ws.readyState !== WebSocket.CONNECTING
    ) {
      ws.reconnect();
    }
    previousState = nextState;
  });
}
