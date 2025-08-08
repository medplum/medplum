// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import assert from 'node:assert';
import { connect, Socket } from 'node:net';
import { Hl7Base } from './base';
import { Hl7Connection, SendAndWaitOptions } from './connection';
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
    // If we are already waiting for a pending connection attempt, just return the deferred promise to that
    // In the case that the promise is already resolve, we will also return a resolved connection
    if (this.deferredConnectionPromise) {
      return this.deferredConnectionPromise.promise;
    }

    const deferredPromise = (this.deferredConnectionPromise = this.createDeferredConnectionPromise());

    // Create the socket
    this.socket = connect({
      host: this.host,
      port: this.port,
      keepAlive: this.keepAlive,
    });

    if (this.connectTimeout > 0) {
      this.socket.setTimeout(this.connectTimeout);
      this.registerSocketTimeoutListener(deferredPromise);
    }

    this.registerSocketConnectListener(deferredPromise);
    this.registerSocketErrorListener(deferredPromise);
    this.registerSocketCloseListener(deferredPromise);

    return deferredPromise.promise;
  }

  private registerSocketTimeoutListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);
    const socket = this.socket;

    // Handle timeout event
    const timeoutListener = (): void => {
      this.cleanupSocket(socket);
      const error = new Error(`Connection timeout after ${this.connectTimeout}ms`);
      this.rejectDeferredPromise(deferredPromise, error);
    };

    socket.on('timeout', timeoutListener);
  }

  private registerSocketConnectListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);
    const socket = this.socket;

    // Handle successful connection
    const connectListener = (): void => {
      if (socket !== this.socket) {
        this.cleanupSocket(socket);
        return;
      }

      // Create the HL7 connection
      let connection: Hl7Connection;
      this.connection = connection = new Hl7Connection(socket, this.encoding);

      // Remove the timeout listener as we're now connected
      socket.setTimeout(0);

      this.registerHl7ConnectionListeners(connection);

      deferredPromise.resolve(connection);
    };

    socket.on('connect', connectListener);
  }

  private registerSocketErrorListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);
    const socket = this.socket;

    // Handle connection errors
    const errorListener = (err: Error | AggregateError): void => {
      this.cleanupSocket(socket);

      if (err.constructor.name === 'AggregateError') {
        this.rejectDeferredPromise(deferredPromise, (err as AggregateError).errors[0]);
      } else {
        this.rejectDeferredPromise(deferredPromise, err);
      }
    };

    socket.on('error', errorListener);
  }

  private registerSocketCloseListener(deferredPromise: DeferredConnectionPromise): void {
    assert(this.socket);
    const socket = this.socket;

    // Handle connection errors
    const closeListener = (): void => {
      this.cleanupSocket(socket);
      this.rejectDeferredPromise(deferredPromise, new Error('Socket closed before connection finished'));
    };
    socket.on('close', closeListener);
  }

  private registerHl7ConnectionListeners(connection: Hl7Connection): void {
    // Set up event handlers
    connection.addEventListener('close', () => {
      this.socket = undefined;
      this.connection = undefined;
      this.deferredConnectionPromise = undefined;
      this.dispatchEvent(new Hl7CloseEvent());
    });

    connection.addEventListener('error', (event) => {
      this.dispatchEvent(new Hl7ErrorEvent(event.error));
    });
  }

  private createDeferredConnectionPromise(): DeferredConnectionPromise {
    // Setup our deferred connection promise
    let resolve!: (connection: Hl7Connection) => void;
    let reject!: (err: Error) => void;

    const promise = new Promise<Hl7Connection>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    return {
      promise,
      resolve,
      reject,
    };
  }

  private rejectDeferredPromise(deferredPromise: DeferredConnectionPromise, err: Error): void {
    // Reject this deferred promise with the given error
    deferredPromise.reject(err);

    // If the currently tracked deferred promise is this deferred promise, remove it from the client
    if (this.deferredConnectionPromise === deferredPromise) {
      this.deferredConnectionPromise = undefined;
    }
  }

  private cleanupSocket(socket: Socket): void {
    if (!socket.destroyed) {
      socket.destroy();
    }
    if (socket === this.socket) {
      this.socket = undefined;
    }
  }

  async send(msg: Hl7Message): Promise<void> {
    return (await this.connect()).send(msg);
  }

  async sendAndWait(msg: Hl7Message, options?: SendAndWaitOptions): Promise<Hl7Message> {
    return (await this.connect()).sendAndWait(msg, options);
  }

  async close(): Promise<void> {
    if (this.deferredConnectionPromise) {
      this.rejectDeferredPromise(this.deferredConnectionPromise, new Error('Client closed while connecting'));
    }

    // Close established connection if it exists
    if (this.connection) {
      const connection = this.connection;
      delete this.connection;
      await connection.close();
    }
    // Close the socket if it exists
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }
  }
}
