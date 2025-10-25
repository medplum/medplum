// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TypedEventTarget } from '../eventtarget';

/*!
 * Reconnecting WebSocket
 * by Pedro Ladaria <pedro.ladaria@gmail.com>
 * https://github.com/pladaria/reconnecting-websocket
 * License MIT
 *
 * Copy of "partysocket" from Partykit team, a fork of the original "Reconnecting WebSocket"
 * https://github.com/partykit/partykit/blob/main/packages/partysocket
 */

export interface IReconnectingWebSocket extends TypedEventTarget<WebSocketEventMap> {
  readyState: number;
  close(code?: number, reason?: string): void;
  send(message: string): void;
  reconnect(code?: number, reason?: string): void;
}

export interface IReconnectingWebSocketCtor {
  new (url: string, protocols?: ProtocolsProvider, options?: Options): IReconnectingWebSocket;
}

export interface ErrorEvent extends globalThis.Event {
  message: string;
  error: Error;
}

export interface CloseEvent extends globalThis.Event {
  code: number;
  reason: string;
  wasClean: boolean;
}

export type WebSocketEventMap = {
  close: CloseEvent;
  error: ErrorEvent;
  message: MessageEvent;
  open: Event;
};

/**
 * This map exists separately from `WebSocketEventMap`, which is the actual event map used for the `ReconnectingWebSocket` class itself,
 * due to slight difference in the type between the events as we use them, and the events as they exist as global interfaces. We need the global interfaces
 * to be generic enough to satisfy conformant implementations that don't exactly match the events we export and use in `ReconnectingWebSocket` itself.
 */
export type IWebSocketEventMap = {
  close: globalThis.CloseEvent;
  error: globalThis.ErrorEvent;
  message: globalThis.MessageEvent;
  open: Event;
};

/**
 * Generic interface that an implementation of `WebSocket` must satisfy to be used with `ReconnectingWebSocket`.
 * This is a slightly modified fork of the `WebSocket` global type used in Node.
 *
 * The main key difference is making all the `onclose`, `onerror`, etc. functions have `any[]` args, making `data` in `send()` of type `any`, and making `binaryType` of type string,
 * though the particular implementation should narrow each of these implementation-specific types.
 */
export interface IWebSocket {
  binaryType: string;

  readonly bufferedAmount: number;
  readonly extensions: string;

  onclose: ((...args: any[]) => any) | null;
  onerror: ((...args: any[]) => any) | null;
  onmessage: ((...args: any[]) => any) | null;
  onopen: ((...args: any[]) => any) | null;

  readonly protocol: string;
  readonly readyState: number;
  readonly url: string;

  close(code?: number, reason?: string): void;
  send(data: any): void;

  readonly CLOSED: number;
  readonly CLOSING: number;
  readonly CONNECTING: number;
  readonly OPEN: number;

  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (ev: WebSocketEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;
}

const Events = {
  Event: (typeof globalThis.Event !== 'undefined' ? globalThis.Event : undefined) as
    | typeof globalThis.Event
    | undefined,
  ErrorEvent: undefined as any,
  CloseEvent: undefined as any,
};

let eventsInitialized = false;

function lazyInitEvents(): void {
  if (typeof globalThis.Event === 'undefined') {
    throw new Error('Unable to lazy init events for ReconnectingWebSocket. globalThis.Event is not defined yet');
  }

  Events.Event = globalThis.Event;

  Events.ErrorEvent = class ErrorEvent extends Event implements ErrorEvent {
    public message: string;
    public error: Error;
    constructor(error: Error, target: any) {
      super('error', target);
      this.message = error.message;
      this.error = error;
    }
  } as unknown as typeof globalThis.ErrorEvent;

  Events.CloseEvent = class CloseEvent extends Event implements CloseEvent {
    public code: number;
    public reason: string;
    public wasClean = true;
    // eslint-disable-next-line default-param-last
    constructor(code = 1000, reason = '', target: any) {
      super('close', target);
      this.code = code;
      this.reason = reason;
    }
  } as unknown as typeof globalThis.CloseEvent;
}

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

function cloneEvent(e: Event): Event {
  return new (e as any).constructor(e.type, e);
}

export type Options<WS extends IWebSocket = WebSocket> = {
  WebSocket?: any;
  binaryType?: WS['binaryType'];
  maxReconnectionDelay?: number;
  minReconnectionDelay?: number;
  reconnectionDelayGrowFactor?: number;
  minUptime?: number;
  connectionTimeout?: number;
  maxRetries?: number;
  maxEnqueuedMessages?: number;
  startClosed?: boolean;
  debug?: boolean;
  debugLogger?: (...args: any[]) => void;
};

const DEFAULT = {
  maxReconnectionDelay: 10000,
  minReconnectionDelay: 1000 + Math.random() * 4000,
  minUptime: 5000,
  reconnectionDelayGrowFactor: 1.3,
  connectionTimeout: 4000,
  maxRetries: Infinity,
  maxEnqueuedMessages: Infinity,
  startClosed: false,
  debug: false,
};

export type ProtocolsProvider = null | string | string[];

export type Message = string | ArrayBuffer | Blob | ArrayBufferView;

let didWarnAboutMissingWebSocket = false;

export class ReconnectingWebSocket<WS extends IWebSocket = WebSocket>
  extends TypedEventTarget<WebSocketEventMap>
  implements IReconnectingWebSocket
{
  private _ws: IWebSocket | undefined;
  private _retryCount = -1;
  private _uptimeTimeout: ReturnType<typeof setTimeout> | undefined;
  private _connectTimeout: ReturnType<typeof setTimeout> | undefined;
  private _shouldReconnect = true;
  private _connectLock = false;
  private _binaryType: WS['binaryType'];
  private _closeCalled = false;
  private _messageQueue: Message[] = [];

  private readonly _debugLogger = console.log.bind(console);

  protected _url: string;
  protected _protocols?: ProtocolsProvider;
  protected _options: Options<WS>;

  constructor(url: string, protocols?: ProtocolsProvider, options: Options<WS> = {}) {
    // Initialize all events if they haven't been created yet
    if (!eventsInitialized) {
      lazyInitEvents();
      eventsInitialized = true;
    }

    super();
    this._url = url;
    this._protocols = protocols;
    this._options = options;
    if (this._options.startClosed) {
      this._shouldReconnect = false;
    }
    if (this._options.binaryType) {
      this._binaryType = this._options.binaryType;
    } else {
      this._binaryType = 'blob';
    }
    if (this._options.debugLogger) {
      this._debugLogger = this._options.debugLogger;
    }
    this._connect();
  }

  static get CONNECTING(): number {
    return 0;
  }
  static get OPEN(): number {
    return 1;
  }
  static get CLOSING(): number {
    return 2;
  }
  static get CLOSED(): number {
    return 3;
  }

  get CONNECTING(): number {
    return ReconnectingWebSocket.CONNECTING;
  }
  get OPEN(): number {
    return ReconnectingWebSocket.OPEN;
  }
  get CLOSING(): number {
    return ReconnectingWebSocket.CLOSING;
  }
  get CLOSED(): number {
    return ReconnectingWebSocket.CLOSED;
  }

  get binaryType(): WS['binaryType'] {
    return this._ws ? this._ws.binaryType : this._binaryType;
  }

  set binaryType(value: WS['binaryType']) {
    this._binaryType = value;
    if (this._ws) {
      this._ws.binaryType = value;
    }
  }

  /**
   * @returns The number or connection retries.
   */
  get retryCount(): number {
    return Math.max(this._retryCount, 0);
  }

  /**
   * @returns The number of bytes of data that have been queued using calls to send() but not yet
   * transmitted to the network. This value resets to zero once all queued data has been sent.
   * This value does not reset to zero when the connection is closed; if you keep calling send(),
   * this will continue to climb. Read only
   *
   */
  get bufferedAmount(): number {
    const bytes = this._messageQueue.reduce((acc, message) => {
      if (typeof message === 'string') {
        acc += message.length; // not byte size
      } else if (message instanceof Blob) {
        acc += message.size;
      } else {
        acc += message.byteLength;
      }
      return acc;
    }, 0);
    return bytes + (this._ws?.bufferedAmount ?? 0);
  }

  /**
   * @returns The extensions selected by the server. This is currently only the empty string or a list of
   * extensions as negotiated by the connection
   */
  get extensions(): string {
    return this._ws?.extensions ?? '';
  }

  /**
   * @returns A string indicating the name of the sub-protocol the server selected;
   * this will be one of the strings specified in the protocols parameter when creating the
   * WebSocket object.
   */
  get protocol(): string {
    return this._ws?.protocol ?? '';
  }

  /**
   * @returns The current state of the connection; this is one of the Ready state constants.
   */
  get readyState(): number {
    if (this._ws) {
      return this._ws.readyState;
    }
    return this._options.startClosed ? ReconnectingWebSocket.CLOSED : ReconnectingWebSocket.CONNECTING;
  }

  /**
   * @returns The URL as resolved by the constructor.
   */
  get url(): string {
    return this._ws ? this._ws.url : '';
  }

  /**
   * @returns Whether the websocket object is now in reconnectable state.
   */
  get shouldReconnect(): boolean {
    return this._shouldReconnect;
  }

  /**
   * An event listener to be called when the WebSocket connection's readyState changes to CLOSED
   */
  public onclose: ((event: CloseEvent) => void) | null = null;

  /**
   * An event listener to be called when an error occurs
   */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * An event listener to be called when a message is received from the server
   */
  public onmessage: ((event: MessageEvent) => void) | null = null;

  /**
   * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
   * this indicates that the connection is ready to send and receive data
   */
  public onopen: ((event: Event) => void) | null = null;

  /**
   * Closes the WebSocket connection or connection attempt, if any. If the connection is already
   * CLOSED, this method does nothing
   * @param code - The code to close with. Default is 1000.
   * @param reason - An optional reason for closing the connection.
   */
  // eslint-disable-next-line default-param-last
  public close(code = 1000, reason?: string): void {
    this._closeCalled = true;
    this._shouldReconnect = false;
    this._clearTimeouts();
    if (!this._ws) {
      this._debug('close enqueued: no ws instance');
      return;
    }
    if (this._ws.readyState === this.CLOSED) {
      this._debug('close: already closed');
      return;
    }
    this._ws.close(code, reason);
  }

  /**
   * Closes the WebSocket connection or connection attempt and connects again.
   * Resets retry counter;
   * @param code - The code to disconnect with. Default is 1000.
   * @param reason - An optional reason for disconnecting the connection.
   */
  public reconnect(code?: number, reason?: string): void {
    this._shouldReconnect = true;
    this._closeCalled = false;
    this._retryCount = -1;
    if (!this._ws || this._ws.readyState === this.CLOSED) {
      this._connect();
    } else {
      this._disconnect(code, reason);
      this._connect();
    }
  }

  /**
   * Enqueue specified data to be transmitted to the server over the WebSocket connection
   * @param data - The data to enqueue.
   */
  public send(data: Message): void {
    if (this._ws && this._ws.readyState === this.OPEN) {
      this._debug('send', data);
      this._ws.send(data);
    } else {
      const { maxEnqueuedMessages = DEFAULT.maxEnqueuedMessages } = this._options;
      if (this._messageQueue.length < maxEnqueuedMessages) {
        this._debug('enqueue', data);
        this._messageQueue.push(data);
      }
    }
  }

  private _debug(...args: unknown[]): void {
    if (this._options.debug) {
      this._debugLogger('RWS>', ...args);
    }
  }

  private _getNextDelay(): number {
    const {
      reconnectionDelayGrowFactor = DEFAULT.reconnectionDelayGrowFactor,
      minReconnectionDelay = DEFAULT.minReconnectionDelay,
      maxReconnectionDelay = DEFAULT.maxReconnectionDelay,
    } = this._options;
    let delay = 0;
    if (this._retryCount > 0) {
      delay = minReconnectionDelay * Math.pow(reconnectionDelayGrowFactor, this._retryCount - 1);
      if (delay > maxReconnectionDelay) {
        delay = maxReconnectionDelay;
      }
    }
    this._debug('next delay', delay);
    return delay;
  }

  private _wait(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this._getNextDelay());
    });
  }

  private _connect(): void {
    if (this._connectLock || !this._shouldReconnect) {
      return;
    }
    this._connectLock = true;

    const { maxRetries = DEFAULT.maxRetries, connectionTimeout = DEFAULT.connectionTimeout } = this._options;

    if (this._retryCount >= maxRetries) {
      this._debug('max retries reached', this._retryCount, '>=', maxRetries);
      return;
    }

    this._retryCount++;

    this._debug('connect', this._retryCount);
    this._removeListeners();

    this._wait()
      .then(() => {
        // close could be called before creating the ws
        if (this._closeCalled) {
          this._connectLock = false;
          return;
        }
        if (!this._options.WebSocket && typeof WebSocket === 'undefined' && !didWarnAboutMissingWebSocket) {
          console.error('‼️ No WebSocket implementation available. You should define options.WebSocket.');
          didWarnAboutMissingWebSocket = true;
        }
        const WS: typeof WebSocket = this._options.WebSocket || WebSocket;
        this._debug('connect', { url: this._url, protocols: this._protocols });
        this._ws = this._protocols ? new WS(this._url, this._protocols) : new WS(this._url);

        this._ws.binaryType = this._binaryType;
        this._connectLock = false;
        this._addListeners();

        this._connectTimeout = setTimeout(() => this._handleTimeout(), connectionTimeout);
      })
      // via https://github.com/pladaria/reconnecting-websocket/pull/166
      .catch((err) => {
        this._connectLock = false;
        this._handleError(new Events.ErrorEvent(Error(err.message), this));
      });
  }

  private _handleTimeout(): void {
    this._debug('timeout event');
    this._handleError(new Events.ErrorEvent(Error('TIMEOUT'), this));
  }

  // eslint-disable-next-line default-param-last
  private _disconnect(code = 1000, reason?: string): void {
    this._clearTimeouts();
    if (!this._ws) {
      return;
    }
    this._removeListeners();
    try {
      this._ws.close(code, reason);
      this._handleClose(new Events.CloseEvent(code, reason, this));
    } catch (_error) {
      // ignore
    }
  }

  private _acceptOpen(): void {
    this._debug('accept open');
    this._retryCount = 0;
  }

  private readonly _handleOpen = (event: Event): void => {
    this._debug('open event');
    const { minUptime = DEFAULT.minUptime } = this._options;

    clearTimeout(this._connectTimeout);
    this._uptimeTimeout = setTimeout(() => this._acceptOpen(), minUptime);

    assert(this._ws, 'WebSocket is not defined');

    this._ws.binaryType = this._binaryType;

    // send enqueued messages (messages sent before websocket open event)
    this._messageQueue.forEach((message) => this._ws?.send(message));
    this._messageQueue = [];

    if (this.onopen) {
      this.onopen(event);
    }
    this.dispatchEvent(cloneEvent(event));
  };

  private readonly _handleMessage = (event: MessageEvent): void => {
    this._debug('message event');

    if (this.onmessage) {
      this.onmessage(event);
    }
    this.dispatchEvent(cloneEvent(event));
  };

  private readonly _handleError = (event: ErrorEvent): void => {
    this._debug('error event', event.message);
    this._disconnect(undefined, event.message === 'TIMEOUT' ? 'timeout' : undefined);

    if (this.onerror) {
      this.onerror(event);
    }
    this._debug('exec error listeners');
    this.dispatchEvent(cloneEvent(event));

    this._connect();
  };

  private readonly _handleClose = (event: CloseEvent): void => {
    this._debug('close event');
    this._clearTimeouts();

    if (this._shouldReconnect) {
      this._connect();
    }

    if (this.onclose) {
      this.onclose(event);
    }
    this.dispatchEvent(cloneEvent(event));
  };

  private _removeListeners(): void {
    if (!this._ws) {
      return;
    }
    this._debug('removeListeners');
    this._ws.removeEventListener('open', this._handleOpen);
    this._ws.removeEventListener('close', this._handleClose);
    this._ws.removeEventListener('message', this._handleMessage);
    this._ws.removeEventListener('error', this._handleError);
  }

  private _addListeners(): void {
    if (!this._ws) {
      return;
    }
    this._debug('addListeners');
    this._ws.addEventListener('open', this._handleOpen);
    this._ws.addEventListener('close', this._handleClose);
    this._ws.addEventListener('message', this._handleMessage);
    this._ws.addEventListener('error', this._handleError);
  }

  private _clearTimeouts(): void {
    clearTimeout(this._connectTimeout);
    clearTimeout(this._uptimeTimeout);
  }
}
