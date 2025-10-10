// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import net from 'node:net';
import type { Hl7ConnectionOptions } from './connection';
import { Hl7Connection } from './connection';

export interface Hl7ServerStopOptions {
  forceDrainTimeoutMs?: number;
}

export const DEFAULT_FORCE_DRAIN_TIMEOUT_MS = 10_000;

export class Hl7Server {
  readonly handler: (connection: Hl7Connection) => void;
  server?: net.Server;
  private encoding: string | undefined = undefined;
  private enhancedMode = false;
  private messagesPerMin: number | undefined = undefined;
  private connections = new Set<Hl7Connection>();

  constructor(handler: (connection: Hl7Connection) => void) {
    this.handler = handler;
  }

  start(port: number, encoding?: string, enhancedMode?: boolean, options?: Hl7ConnectionOptions): void {
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

    // Node errors have a code
    const errorListener = async (e: Error & { code?: string }): Promise<void> => {
      if (e?.code === 'EADDRINUSE') {
        await sleep(50);
        server.close();
        server.listen(port);
      }
    };
    server.on('error', errorListener);

    server.once('listening', () => {
      server.off('error', errorListener);
    });

    server.listen(port);
    this.server = server;
  }

  async stop(options?: Hl7ServerStopOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Stop was called but there is no server running'));
        return;
      }
      let forceDrainTimeout: NodeJS.Timeout | undefined;
      if (options?.forceDrainMs !== -1) {
        forceDrainTimeout = setTimeout(() => {
          for (const connection of this.connections) {
            // TODO: Handle this better
            connection.close().catch(console.error);
          }
        }, options?.forceDrainMs ?? DEFAULT_FORCE_DRAIN_TIMEOUT_MS);
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        if (forceDrainTimeout) {
          clearTimeout(forceDrainTimeout);
        }
        resolve();
      });

      this.server = undefined;
      this.connections.clear();
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
