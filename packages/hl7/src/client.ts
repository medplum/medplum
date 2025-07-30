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
    // If we already have a connection, use it
    if (this.connection) {
      return Promise.resolve(this.connection);
    }

    // If there's an ongoing connection attempt, destroy it
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }

    return new Promise((resolve, reject) => {
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
        this.socket.on('timeout', () => {
          const error = new Error(`Connection timeout after ${this.connectTimeout}ms`);
          if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
          }
          reject(error);
        });
      }

      // Handle successful connection
      this.socket.on('connect', () => {
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
      });

      // Handle connection errors
      this.socket.on('error', (err) => {
        if (this.socket) {
          this.socket.destroy();
          this.socket = undefined;
        }
        reject(err);
      });
    });
  }

  async send(msg: Hl7Message): Promise<void> {
    return (await this.connect()).send(msg);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    return (await this.connect()).sendAndWait(msg);
  }

  close(): void {
    // Close the socket if it exists
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }

    // Close established connection if it exists
    if (this.connection) {
      this.connection.close();
      delete this.connection;
    }
  }
}
