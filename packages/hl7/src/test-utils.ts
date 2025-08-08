// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';

export class MockSocket extends Duplex {
  destroyed = false;
  closed = false;
  handlers: Record<string, () => void> = {};
  setEncoding = jest.fn();
  setTimeout = jest.fn();

  on(event: unknown, listener: unknown): this {
    this.handlers[event as string] = listener as () => void;
    return super.on(event as any, listener as any);
  }

  close(): this {
    if (!this.closed) {
      this.closed = true;
      super.end();
      this.emit('close');
    }
    return this;
  }

  end(): this {
    return this.close();
  }

  destroy(_error?: Error): this {
    if (!this.destroyed) {
      this.destroyed = true;
      super.destroy();
    }
    return this.close();
  }

  write = jest.fn((chunk) => {
    this.emit('mockWrite', chunk);
  }) as any;
}

export class MockServer extends EventEmitter {
  private closed = false;
  private sockets = new Set<MockSocket>();
  listen = jest.fn();
  close = jest.fn((callback: (err?: Error) => void) => {
    if (!this.closed) {
      this.closed = true;
      for (const socket of this.sockets) {
        socket.close();
      }
      this.sockets.clear();
      this.removeAllListeners();
      callback();
    }
  });
  connectionListener?: (socket: MockSocket) => void;
  mockConnect(clientSocket: MockSocket, serverSocket: MockSocket): void {
    if (this.connectionListener) {
      clientSocket.on('mockWrite', (chunk: string) => {
        serverSocket.emit('data', chunk);
      });

      serverSocket.on('mockWrite', (chunk: string) => {
        clientSocket.emit('data', chunk);
      });

      clientSocket.emit('connect');
      this.connectionListener(serverSocket);
      this.sockets.add(serverSocket);
    }
  }
}
