import { getWebSocketUrl, MedplumClient } from '@medplum/core';
import WS from 'jest-websocket-mock';
import { AppState, AppStateEvent, AppStateStatus, Platform } from 'react-native';
import { initWebSocketManager } from './websocket-manager';

if (Platform.OS !== 'web') {
  describe('WebSocket Manager', () => {
    let medplum: MedplumClient;
    let wsServer: WS;

    beforeEach(() => {
      medplum = new MedplumClient({ baseUrl: 'https://example.com/', fetch: jest.fn() });
      wsServer = new WS(getWebSocketUrl(medplum.getBaseUrl(), '/ws/subscriptions-r4'));
    });

    afterEach(() => {
      WS.clean();
    });

    test('initWebSocketManager', async () => {
      let callback!: (state: AppStateStatus) => void;
      const addEventListenerSpy = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((type: AppStateEvent, listener: (state: AppStateStatus) => void) => {
          if (type !== 'change') {
            throw new Error('Wrong event type');
          }
          callback = listener;
          return { remove: () => undefined };
        });
      AppState.currentState = 'unknown';

      const ws = medplum.getSubscriptionManager().getWebSocket();
      await wsServer.connected;

      const reconnectSpy = jest.spyOn(ws, 'reconnect');
      const closeSpy = jest.spyOn(ws, 'close');

      initWebSocketManager(medplum);
      expect(addEventListenerSpy).toHaveBeenCalled();

      // Test unknown -> active, when WebSocket still connecting
      expect([WebSocket.CONNECTING, WebSocket.OPEN]).toContain(ws.readyState);
      expect(AppState.currentState).toStrictEqual('unknown');
      callback('active');
      expect(reconnectSpy).not.toHaveBeenCalled();

      const closedPromise = new Promise<void>((resolve) => {
        const listener = (): void => {
          resolve();
          ws.removeEventListener('close', listener);
        };
        ws.addEventListener('close', listener);
      });

      // Test active -> background
      callback('background');
      expect(closeSpy).toHaveBeenCalled();
      closeSpy.mockClear();

      await closedPromise;

      // Test background -> active when closed
      expect(ws.readyState).toStrictEqual(WebSocket.CLOSED);
      callback('active');
      expect(reconnectSpy).toHaveBeenCalled();

      // Clean up to prevent hanging test
      medplum.getSubscriptionManager().closeWebSocket();
    });
  });
} else {
  test('No tests for Web', () => {
    expect(true).toStrictEqual(true);
  });
}
