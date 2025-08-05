import { Hl7Message } from '@medplum/core';
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

export class Hl7Client extends Hl7Base {
  options: Hl7ClientOptions;
  host: string;
  port: number;
  encoding?: string;
  connection?: Hl7Connection;
  keepAlive: boolean;
  private socket?: Socket;
  private connectTimeout: number;
  private rejectConnectPromise?: (err: Error) => void;
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
    if (this.connection && !this.connection.isClosed()) {
      return Promise.resolve(this.connection);
    }

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

    // We reject any existing connect promise since that connect promise will never resolve otherwise
    if (this.rejectConnectPromise) {
      this.rejectConnectPromise(new Error('Connection attempt interrupted by new attempt to connect'));
    }

    return new Promise((resolve, reject) => {
      // Attach the reject for this promise to the client, so that if we try to connect again later, we reject the old promise
      // And don't leave it hanging
      this.rejectConnectPromise = reject;

      // Create the socket
      this.socket = connect({
        host: this.host,
        port: this.port,
        keepAlive: this.keepAlive,
      });

      // Set timeout if specified
      if (this.connectTimeout > 0) {
        this.socket.setTimeout(this.connectTimeout);

        // Handle timeout event
        const timeoutListener = (): void => {
          const error = new Error(`Connection timeout after ${this.connectTimeout}ms`);
          if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
          }
          reject(error);
        };
        this.socket.on('timeout', timeoutListener);
        this.socketListeners.set('timeout', timeoutListener);
      }

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

        // Set up event handlers
        connection.addEventListener('close', () => {
          this.socket = undefined;
          this.connection = undefined;
          this.dispatchEvent(new Hl7CloseEvent());
        });

        connection.addEventListener('error', (event) => {
          this.dispatchEvent(new Hl7ErrorEvent(event.error));
        });

        resolve(this.connection);
      };
      this.socket.on('connect', connectListener);
      this.socketListeners.set('connect', connectListener);

      // Handle connection errors
      const errorListener = (err: Error): void => {
        if (this.socket) {
          this.socket.destroy();
          this.socket = undefined;
        }
        reject(err);
      };
      this.socket.on('error', errorListener);
      this.socketListeners.set('error', errorListener);
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

    if (this.rejectConnectPromise) {
      this.rejectConnectPromise(new Error('Client closed while connecting'));
      this.rejectConnectPromise = undefined;
    }

    // Close established connection if it exists
    if (this.connection) {
      const connection = this.connection;
      delete this.connection;
      await connection.close();
    }
  }
}
