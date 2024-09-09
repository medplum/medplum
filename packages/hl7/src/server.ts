import net from 'node:net';
import { Hl7Connection } from './connection';

export class Hl7Server {
  server?: net.Server;

  constructor(public readonly handler: (connection: Hl7Connection) => void) {}

  start(port: number, encoding?: string): void {
    const server = net.createServer((socket) => {
      const connection = new Hl7Connection(socket, encoding);
      this.handler(connection);
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
}
