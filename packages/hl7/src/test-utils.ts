// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { Duplex } from 'node:stream';

export class MockSocket extends Duplex {
  destroyed = false;
  closed = false;
  handlers: Record<string, () => void> = {};
  setEncoding = vi.fn() as (encoding?: BufferEncoding) => this;
  setTimeout = vi.fn() as (timeout: number, callback?: () => void) => this;

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

  write = vi.fn((chunk) => {
    this.emit('mockWrite', chunk);
  }) as any;
}

export class MockServer extends EventEmitter {
  private closed = false;
  private sockets = new Set<MockSocket>();
  private boundPort = 0;
  listen = vi.fn((port, callback) => {
    this.boundPort = port;
    callback();
  });
  address = vi.fn(() => ({ port: this.boundPort }));
  close = vi.fn((callback: (err?: Error) => void) => {
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

// Every port ever handed out by `getFreePort`, so we never issue the same one twice
// within a single test process — see the comment on `getFreePort` below.
const issuedPorts = new Set<number>();

// Used only for tests that need a free port number with *nothing* listening on it.
// For tests that start an Hl7Server, prefer `server.start(0)` which returns the OS-assigned
// port and never has a release-then-rebind window.
//
// Because we close the probing server before returning, the port is freed immediately and the
// OS may hand the *same* ephemeral port to a subsequent call. Callers that allocate two ports
// (e.g. one per channel) would then collide. To avoid this, remember every port we issue and
// keep any probing server that lands on an already-issued port open until we find a fresh one,
// so the OS can't reissue it in the same round.
export async function getFreePort(): Promise<number> {
  const heldServers: ReturnType<typeof createServer>[] = [];
  const closeServer = async (server: ReturnType<typeof createServer>): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const server = createServer();
      const port = await new Promise<number>((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, () => {
          resolve((server.address() as { port: number }).port);
        });
      });
      if (issuedPorts.has(port)) {
        // Keep this server listening so the OS won't hand the same port out again this round.
        heldServers.push(server);
        continue;
      }
      issuedPorts.add(port);
      await closeServer(server);
      return port;
    }
    throw new Error('Unable to find a free port after 20 attempts');
  } finally {
    await Promise.all(heldServers.map((server) => closeServer(server).catch(() => undefined)));
  }
}
