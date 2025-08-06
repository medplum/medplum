import { Hl7Message } from '@medplum/core';
import assert from 'node:assert';
import { connect, Socket } from 'node:net';
import { Hl7Base } from './base';
import { Hl7Connection } from './connection';
import { Hl7CloseEvent, Hl7ErrorEvent } from './events';

export interface Hl7ClientOptions {
  host: string;
  port: number;
  encoding?: string;
  keepAlive?: boolean;
  connectTimeout?: number; // Add timeout option
}

export interface DeferredConnectionPromise {
  promise: Promise<Hl7Connection>;
  resolve: (connection: Hl7Connection) => void;
  reject: (err: Error) => void;
}

export class Hl7Client extends Hl7Base {
  options: Hl7ClientOptions;
  host: string;
  port: number;
  encoding?: string;
  connection?: Hl7Connection;
  keepAlive: boolean;
  private socket?: Socket;
  private connectTimeout: number;
  private deferredConnectionPromise?: DeferredConnectionPromise;
  private readonly socketListeners = new Map<string, (...args: any[]) => void>();

  constructor(options: Hl7ClientOptions) {
    super();
    this.options = options;
    this.host = this.options.host;
    this.port = this.options.port;
    this.encoding = this.options.encoding;
    this.keepAlive = this.options.keepAlive ?? false;
    this.connectTimeout = this.options.connectTimeout ?? 30000; // Default 30 seconds
  }

  connect(): Promise<Hl7Connection> {
    // We check to see if a) there is a connection and b) if it's already closed
    // If it's closed we attempt to reject the current connection promise just in case somehow it hasn't resolved
    // And then we remove the deferred connection promise which makes us skip over the next early return
    if (this.connection?.isClosed()) {
      this.deferredConnectionPromise?.reject(new Error('Connection closed, connect attempt failed'));
      this.deferredConnectionPromise = undefined;
    }

    // If we are already waiting for a pending connection attempt, just return the deferred promise to that
    // In the case that the promise is already resolve, we will also return a resolved connection
    if (this.deferredConnectionPromise) {
      return this.deferredConnectionPromise.promise;
    }

    // If we made it here that means that there is no current deferredConnectionPromise, so we are going to try to make a new one
    // If there's an ongoing connection attempt, destroy it
    if (this.socket) {
      // We surgically unregister the event listeners that we as the client register,
      // since there are lifecycle events that the Hl7Connection itself registers and we don't want to just purge all the event listeners
      for (const [eventName, listener] of this.socketListeners.entries()) {
        this.socket.off(eventName, listener);
      }
      this.socketListeners.clear();
      this.socket.destroy();
      this.socket = undefined;
    }

    const promise = new Promise<Hl7Connection>((resolve, reject) => {
      this.deferredConnectionPromise = {
        promise,
        resolve,
        reject,
      };

      // Create the socket
      this.socket = connect({
        host: this.host,
        port: this.port,
        keepAlive: this.keepAlive,
      });

      if (this.connectTimeout > 0) {
        this.socket.setTimeout(this.connectTimeout);
        this.registerSocketTimeoutListener(this.deferredConnectionPromise);
      }

      this.registerSocketConnectListener(this.deferredConnectionPromise);
      this.registerSocketErrorListener(this.deferredConnectionPromise);
    });

    return promise;
  }

  private registerSocketTimeoutListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);

    // Handle timeout event
    const timeoutListener = (): void => {
      const error = new Error(`Connection timeout after ${this.connectTimeout}ms`);
      if (this.socket) {
        this.socket.destroy();
        this.socket = undefined;
      }
      deferredPromise.reject(error);
    };
    this.socket.on('timeout', timeoutListener);
    this.socketListeners.set('timeout', timeoutListener);
  }

  private registerSocketConnectListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);

    // Handle successful connection
    const connectListener = (): void => {
      if (!this.socket) {
        return; // Socket was already destroyed
      }

      // Create the HL7 connection
      let connection: Hl7Connection;
      this.connection = connection = new Hl7Connection(this.socket, this.encoding);

      // Remove the timeout listener as we're now connected
      this.socket.setTimeout(0);

      this.registerHl7ConnectionListeners(connection);

      deferredPromise.resolve(this.connection);
    };
    this.socket.on('connect', connectListener);
    this.socketListeners.set('connect', connectListener);
  }

  private registerSocketErrorListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);

    // Handle connection errors
    const errorListener = (err: Error): void => {
      if (this.socket) {
        this.socket.destroy();
        this.socket = undefined;
      }
      deferredPromise.reject(err);
    };
    this.socket.on('error', errorListener);
    this.socketListeners.set('error', errorListener);
  }

  private registerHl7ConnectionListeners(connection: Hl7Connection): void {
    // Set up event handlers
    connection.addEventListener('close', () => {
      this.socket = undefined;
      this.connection = undefined;
      this.dispatchEvent(new Hl7CloseEvent());
    });

    connection.addEventListener('error', (event) => {
      this.dispatchEvent(new Hl7ErrorEvent(event.error));
    });
  }

  async send(msg: Hl7Message): Promise<void> {
    return (await this.connect()).send(msg);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    return (await this.connect()).sendAndWait(msg);
  }

  async close(): Promise<void> {
    // Close the socket if it exists
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }

    if (this.deferredConnectionPromise) {
      this.deferredConnectionPromise.reject(new Error('Client closed while connecting'));
      this.deferredConnectionPromise = undefined;
    }

    // Close established connection if it exists
    if (this.connection) {
      const connection = this.connection;
      delete this.connection;
      await connection.close();
    }
  }
}
