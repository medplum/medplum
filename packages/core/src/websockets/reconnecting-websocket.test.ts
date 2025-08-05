// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import WS from 'jest-websocket-mock';
import { sleep } from '../utils';
import { assert, ReconnectingWebSocket } from './reconnecting-websocket';

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
    expect(closedEvent.type).toStrictEqual('close');
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
    expect(closedEvent.type).toStrictEqual('close');

    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });

    reconnectingWebSocket.reconnect();

    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    const closedPromise2 = new Promise<WebSocketEventMap['close']>((resolve) => {
      reconnectingWebSocket.addEventListener('close', (event) => {
        resolve(event);
      });
    });
    const openPromise2 = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    reconnectingWebSocket.reconnect();
    const closedEvent2 = await closedPromise2;
    expect(closedEvent2.type).toStrictEqual('close');

    const openEvent2 = await openPromise2;
    expect(openEvent2.type).toStrictEqual('open');
  });

  test('onopen', async () => {
    const event = await new Promise<Event>((resolve) => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      reconnectingWebSocket.onopen = resolve;
    });
    expect(event.type).toStrictEqual('open');
  });

  test('onclose', async () => {
    const event1 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      reconnectingWebSocket.onopen = resolve;
    });
    expect(event1.type).toStrictEqual('open');

    const event2 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket.onclose = resolve;
      reconnectingWebSocket.close();
    });
    expect(event2.type).toStrictEqual('close');
  });

  test('onmessage', async () => {
    const event1 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      reconnectingWebSocket.onopen = resolve;
    });
    expect(event1.type).toStrictEqual('open');

    const event2 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket.onmessage = resolve;
      wsServer.send('Hello, world!');
    });
    expect(event2.type).toStrictEqual('message');
  });

  test('onerror', async () => {
    const event1 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      reconnectingWebSocket.onopen = resolve;
    });
    expect(event1.type).toStrictEqual('open');

    const event2 = await new Promise<Event>((resolve) => {
      reconnectingWebSocket.onerror = resolve;
      wsServer.error();
    });
    expect(event2.type).toStrictEqual('error');
  });

  test('.bufferedAmount', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toStrictEqual(0);

    // Test buffering before WebSocket is open
    reconnectingWebSocket.send('Hello, Medplum!');
    expect(reconnectingWebSocket.bufferedAmount).toBeGreaterThan(0);

    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    expect(reconnectingWebSocket.bufferedAmount).toStrictEqual(0);
  });

  test('.extensions', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toStrictEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    expect(reconnectingWebSocket.extensions).toStrictEqual('');
  });

  test('.binaryType', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toStrictEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    expect(reconnectingWebSocket.binaryType).toStrictEqual('blob');
    expect(() => {
      reconnectingWebSocket.binaryType = 'arraybuffer';
    }).not.toThrow();
    expect(reconnectingWebSocket.binaryType).toStrictEqual('arraybuffer');
  });

  test('options.startClosed', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws', undefined, { startClosed: true });
    await sleep(200);
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.CLOSED);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    reconnectingWebSocket.reconnect();
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.OPEN);
  });

  test('options.maxRetries', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws', undefined, {
      startClosed: true,
      maxRetries: -1,
    });
    const openPromise = new Promise<void>((resolve, reject) => {
      reconnectingWebSocket.addEventListener('open', () => {
        reject(new Error('open called'));
      });
      reconnectingWebSocket.reconnect();
      sleep(400).then(resolve).catch(reject);
    });
    await openPromise;
  });

  test('globalThis.WebSocket undefined', async () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();
    const originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error This is not allowed
    globalThis.WebSocket = undefined;

    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    await sleep(0);
    expect(console.error).toHaveBeenCalledWith(
      '‼️ No WebSocket implementation available. You should define options.WebSocket.'
    );

    globalThis.WebSocket = originalWebSocket;
    console.error = originalConsoleError;
  });

  test('assert', () => {
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(false)).toThrow();
  });

  test('Handle errors', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    expect(reconnectingWebSocket.bufferedAmount).toStrictEqual(0);
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', (event) => {
        resolve(event);
      });
    });
    await wsServer.connected;
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    const errorPromise = new Promise<WebSocketEventMap['error']>((resolve) => {
      reconnectingWebSocket.addEventListener('error', (event) => {
        resolve(event);
      });
    });
    wsServer.error();

    const errorEvent = await errorPromise;
    expect(errorEvent.type).toStrictEqual('error');
  });
});
