import net from 'net';
import { Hl7Connection } from './connection';

export class Hl7Server {
  server?: net.Server;

  constructor(public readonly handler: (connection: Hl7Connection) => void) {}

  start(port: number, encoding?: BufferEncoding): void {
    const server = net.createServer((socket) => {
      const connection = new Hl7Connection(socket, encoding);
      this.handler(connection);
    });

    server.listen(port);
    this.server = server;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
