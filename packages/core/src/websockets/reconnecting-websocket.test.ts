// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import { WS } from 'vitest-websocket-mock';
import { sleep } from '../utils';
import type { ErrorEvent, WebSocketEventMap } from './reconnecting-websocket';
import { assert, normalizeErrorEvent, ReconnectingWebSocket } from './reconnecting-websocket';

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

  test('.reconnect() succeeds after maxRetries has been exhausted', async () => {
    // Connect to a URL with no server -- the connection attempt fails and, with maxRetries: 0,
    // no automatic retries are allowed.
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/no-server', undefined, {
      maxRetries: 0,
      connectionTimeout: 100,
      minReconnectionDelay: 10,
      maxReconnectionDelay: 20,
    });

    await new Promise<WebSocketEventMap['error']>((resolve) => {
      reconnectingWebSocket.addEventListener('error', resolve);
    });

    // Give the failed attempt time to hit the maxRetries branch
    await sleep(100);

    // Start a server and explicitly reconnect -- this resets the retry counter and must be able
    // to take the connect lock again (the lock must not stay held by the maxRetries early return)
    const lateServer = new WS('wss://example.com/no-server');
    const openPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
      reconnectingWebSocket.addEventListener('open', resolve);
    });
    reconnectingWebSocket.reconnect();
    const openEvent = await openPromise;
    expect(openEvent.type).toStrictEqual('open');

    reconnectingWebSocket.close();
    lateServer.close();
  });

  test('globalThis.WebSocket undefined', async () => {
    const originalConsoleError = console.error;
    console.error = vi.fn();
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
    // The underlying mock dispatches a plain `Event` (the browser shape, with no `message`/`error`),
    // so the normalized event should still carry a real `Error` and a non-empty `message`.
    expect(errorEvent.error).toBeInstanceOf(Error);
    expect(errorEvent.message).toStrictEqual('WebSocket error');
  });

  test('Dispatched close event preserves code/reason', async () => {
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    await wsServer.connected;

    // `reconnect()` goes through `_disconnect()`, which dispatches the polyfilled `CloseEvent`.
    // `cloneEvent` must reconstruct it correctly rather than mangling `code` into the string 'close'.
    const closePromise = new Promise<WebSocketEventMap['close']>((resolve) => {
      reconnectingWebSocket.addEventListener('close', (event) => {
        resolve(event);
      });
    });
    reconnectingWebSocket.reconnect();

    const closeEvent = await closePromise;
    expect(closeEvent.type).toStrictEqual('close');
    expect(closeEvent.code).toStrictEqual(1000);
  });

  describe('normalizeErrorEvent', () => {
    beforeEach(() => {
      // Constructing a ReconnectingWebSocket lazily initializes the internal Event polyfills that
      // normalizeErrorEvent relies on; without this the helper has no `ErrorEvent` class to build.
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
    });

    test('Browser shape (plain Event, no message/error)', () => {
      const result = normalizeErrorEvent(new Event('error'), null);
      expect(result.type).toStrictEqual('error');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.message).toStrictEqual('WebSocket error');
      expect(result.error.message).toStrictEqual('WebSocket error');
    });

    test('Bun shape (message string, no error)', () => {
      const result = normalizeErrorEvent({ type: 'error', message: 'Failed to connect' } as ErrorEvent, null);
      expect(result.type).toStrictEqual('error');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.message).toStrictEqual('Failed to connect');
      expect(result.error.message).toStrictEqual('Failed to connect');
    });

    test('ws/undici shape (real Error preserved)', () => {
      const originalError = new Error('ECONNREFUSED');
      const result = normalizeErrorEvent(
        { type: 'error', message: 'ECONNREFUSED', error: originalError } as ErrorEvent,
        null
      );
      expect(result.type).toStrictEqual('error');
      // The original Error instance should be carried through unchanged.
      expect(result.error).toBe(originalError);
      expect(result.message).toStrictEqual('ECONNREFUSED');
    });

    test('Prefers a real error over a message string', () => {
      const originalError = new Error('underlying cause');
      const result = normalizeErrorEvent(
        { type: 'error', message: 'some other message', error: originalError } as ErrorEvent,
        null
      );
      expect(result.error).toBe(originalError);
      expect(result.message).toStrictEqual('underlying cause');
    });
  });

  describe('onX handler vs addEventListener receive distinct event identities', () => {
    // For each event type, the `onX` handler receives the original (or normalized) event, while
    // `addEventListener` listeners receive a clone — distinct object identities, equivalent content.
    function expectDistinctIdentity(onEvent: Event | undefined, listenerEvent: Event, type: string): void {
      expect(onEvent).toBeDefined();
      expect(onEvent?.type).toStrictEqual(type);
      expect(listenerEvent.type).toStrictEqual(type);
      expect(listenerEvent).not.toBe(onEvent);
    }

    test('open', async () => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      let onEvent: Event | undefined;
      const listenerPromise = new Promise<WebSocketEventMap['open']>((resolve) => {
        reconnectingWebSocket.onopen = (event) => {
          onEvent = event;
        };
        reconnectingWebSocket.addEventListener('open', resolve);
      });
      await wsServer.connected;
      const listenerEvent = await listenerPromise;
      expectDistinctIdentity(onEvent, listenerEvent, 'open');
    });

    test('message', async () => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      await wsServer.connected;
      let onEvent: MessageEvent | undefined;
      const listenerPromise = new Promise<WebSocketEventMap['message']>((resolve) => {
        reconnectingWebSocket.onmessage = (event) => {
          onEvent = event;
        };
        reconnectingWebSocket.addEventListener('message', resolve);
      });
      wsServer.send('Hello, world!');
      const listenerEvent = await listenerPromise;
      expectDistinctIdentity(onEvent, listenerEvent, 'message');
      expect(listenerEvent.data).toStrictEqual('Hello, world!');
      expect(listenerEvent.data).toStrictEqual(onEvent?.data);
    });

    test('close', async () => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      await wsServer.connected;
      let onEvent: WebSocketEventMap['close'] | undefined;
      const listenerPromise = new Promise<WebSocketEventMap['close']>((resolve) => {
        reconnectingWebSocket.onclose = (event) => {
          onEvent = event;
        };
        reconnectingWebSocket.addEventListener('close', resolve);
      });
      reconnectingWebSocket.close();
      const listenerEvent = await listenerPromise;
      expectDistinctIdentity(onEvent, listenerEvent, 'close');
      expect(listenerEvent.code).toStrictEqual(onEvent?.code);
    });

    test('error', async () => {
      reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws');
      await wsServer.connected;
      let onEvent: WebSocketEventMap['error'] | undefined;
      const listenerPromise = new Promise<WebSocketEventMap['error']>((resolve) => {
        reconnectingWebSocket.onerror = (event) => {
          onEvent = event;
        };
        reconnectingWebSocket.addEventListener('error', resolve);
      });
      wsServer.error();
      const listenerEvent = await listenerPromise;
      expectDistinctIdentity(onEvent, listenerEvent, 'error');
      // The cloned event is a distinct ErrorEvent, but carries the same underlying Error instance.
      expect(listenerEvent.error).toBeInstanceOf(Error);
      expect(listenerEvent.error).toBe(onEvent?.error);
      expect(listenerEvent.message).toStrictEqual(onEvent?.message);
    });
  });
});
