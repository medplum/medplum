// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import net from 'node:net';
import { Hl7Connection, Hl7ConnectionOptions } from './connection';

export class Hl7Server {
  readonly handler: (connection: Hl7Connection) => void;
  server?: net.Server;
  private encoding: string | undefined = undefined;
  private enhancedMode = false;
  private messagesPerMin: number | undefined = undefined;

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

  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Stop was called but there is no server running'));
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
      this.server = undefined;
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
