// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import net from 'node:net';
import type { Hl7ConnectionOptions } from './connection';
import { Hl7Connection } from './connection';

/**
 * Options for configuring the `Hl7Server#stop` method.
 */
export interface Hl7ServerStopOptions {
  /**
   * Time in milliseconds to allow client connections to gracefully close after the stop method has been called, before forcefully closing them.
   *
   * Can be set to `-1` to disable forceful draining of connections during stop.
   *
   * Defaults to `10_000`.
   */
  forceDrainTimeoutMs?: number;
}

export const DEFAULT_FORCE_DRAIN_TIMEOUT_MS = 10_000;

export class Hl7Server {
  readonly handler: (connection: Hl7Connection) => void;
  server?: net.Server;
  private encoding: string | undefined = undefined;
  private enhancedMode = false;
  private messagesPerMin: number | undefined = undefined;
  private readonly connections = new Set<Hl7Connection>();

  constructor(handler: (connection: Hl7Connection) => void) {
    this.handler = handler;
  }

  async start(port: number, encoding?: string, enhancedMode?: boolean, options?: Hl7ConnectionOptions): Promise<void> {
    if (encoding) {
      this.setEncoding(encoding);
    }
    if (enhancedMode !== undefined) {
      this.setEnhancedMode(enhancedMode);
    }
    if (options?.messagesPerMin !== undefined) {
      this.setMessagesPerMin(options.messagesPerMin);
    }

    const server = net.createServer((socket) => {
      const connection = new Hl7Connection(socket, this.encoding, this.enhancedMode, {
        messagesPerMin: this.messagesPerMin,
      });
      this.handler(connection);
      this.connections.add(connection);
      connection.addEventListener('close', () => {
        this.connections.delete(connection);
      });
    });

    await new Promise<void>((resolve) => {
      const listenOnPort = (port: number): void => {
        server.listen(port, resolve);
      };

      // Node errors have a code
      const errorListener = async (e: Error & { code?: string }): Promise<void> => {
        if (e?.code === 'EADDRINUSE') {
          await sleep(50);
          server.close();
          listenOnPort(port);
        }
      };

      server.on('error', errorListener);

      server.once('listening', () => {
        server.off('error', errorListener);
      });

      listenOnPort(port);

      this.server = server;
    });
  }

  /**
   * Stops the HL7 server.
   *
   * By default, the server will stop accepting new connections after this method is called, and wait for current connections to close naturally.
   *
   * If all connections don't close within 10 seconds, the server will forcefully close them before shutting down.
   *
   * The default time to wait before forcefully closing connections can be changed by passing an integer value for the optional `options.forceDrainTimeoutMs`.
   *
   * Forced drain can also be disabled by passing `-1` for `options.forceDrainTimeoutMs`.
   * @param options - Optional options to configure the stopping of the server.
   * @returns Promise that resolves when the server has stopped, or rejects if an error prevents server from stopping.
   */
  async stop(options?: Hl7ServerStopOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Stop was called but there is no server running'));
        return;
      }
      let forceDrainTimeout: NodeJS.Timeout | undefined;
      if (options?.forceDrainTimeoutMs !== -1) {
        forceDrainTimeout = setTimeout(() => {
          for (const connection of this.connections) {
            // Theoretically close should almost never throw as most errors are caught internal to the method and emitted as error events
            // We put a .catch here to prevent floating promises and log any errors that somehow make it through
            connection.close().catch(console.error);
          }
        }, options?.forceDrainTimeoutMs ?? DEFAULT_FORCE_DRAIN_TIMEOUT_MS);
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        if (forceDrainTimeout) {
          clearTimeout(forceDrainTimeout);
        }
        this.connections.clear();
        this.server = undefined;
        resolve();
      });
    });
  }

  setEnhancedMode(enhancedMode: boolean): void {
    this.enhancedMode = enhancedMode;
  }

  getEnhancedMode(): boolean {
    return this.enhancedMode;
  }

  setEncoding(encoding: string | undefined): void {
    this.encoding = encoding;
  }

  getEncoding(): string | undefined {
    return this.encoding;
  }

  setMessagesPerMin(messagesPerMin: number | undefined): void {
    this.messagesPerMin = messagesPerMin;
  }

  getMessagesPerMin(): number | undefined {
    return this.messagesPerMin;
  }
}
