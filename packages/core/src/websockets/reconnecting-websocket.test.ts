import WS from 'jest-websocket-mock';
import { ReconnectingWebSocket } from './reconnecting-websocket';

describe('ReconnectingWebSocket', () => {
  let wsServer: WS;
  let reconnectingWebSocket: ReconnectingWebSocket;

  beforeEach(() => {
    wsServer = new WS('wss://example.com/ws');
  });

  afterEach(() => {
    WS.clean();
  });

  test('.close()', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    await wsServer.connected;

    const closedPromise = new Promise<WebSocketEventMap['close']>((resolve) => {
      reconnectingWebSocket.addEventListener('close', (event) => {
        resolve(event);
      });
    });

    reconnectingWebSocket.close();
    const closedEvent = await closedPromise;
    expect(closedEvent.type).toEqual('close');
  });

  test('.reconnect()', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    await wsServer.connected;

    const closedPromise = new Promise<WebSocketEventMap['close']>((resolve) => {
      reconnectingWebSocket.addEventListener('close', (event) => {
        resolve(event);
      });
    });

    reconnectingWebSocket.close();
    const closedEvent = await closedPromise;
    expect(closedEvent.type).toEqual('close');

    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });

    reconnectingWebSocket.reconnect();

    const openEvent = await openPromise;
    expect(openEvent.type).toEqual('open');
  });

  test('.bufferedAmount', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toEqual('open');

    expect(reconnectingWebSocket.bufferedAmount).toEqual(0);
    // TODO: Figure out how to best test bufferedAmount
  });

  test('.extensions', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toEqual('open');

    expect(reconnectingWebSocket.extensions).toEqual('');
  });

  test('.binaryType', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toEqual('open');

    expect(reconnectingWebSocket.binaryType).toEqual('blob');
    expect(() => {
      reconnectingWebSocket.binaryType = 'arraybuffer';
    }).not.toThrow();
    expect(reconnectingWebSocket.binaryType).toEqual('arraybuffer');
  });

  test('Handle errors', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toEqual('open');

    const errorPromise = new Promise<WebSocketEventMap['error']>((resolve) => {
      reconnectingWebSocket.addEventListener('error', (event) => {
        resolve(event);
      });
    });
    wsServer.error();

    const errorEvent = await errorPromise;
    expect(errorEvent.type).toEqual('error');
  });
});
