import { Hl7Message } from '@medplum/core';
import net from 'net';
import { Hl7Base } from './base';
import { CR, FS } from './constants';
import { Hl7ErrorEvent, Hl7MessageEvent } from './events';

export class Hl7Server extends Hl7Base {
  server?: net.Server;

  start(port: number, encoding?: BufferEncoding): void {
    const server = net.createServer((socket) => {
      let buffer = '';

      socket
        .on('data', (data) => {
          try {
            buffer += data.toString();
            if (buffer.endsWith(FS + CR)) {
              const message = Hl7Message.parse(buffer.substring(1, buffer.length - 2));
              this.dispatchEvent(new Hl7MessageEvent(socket, message));
              buffer = '';
            }
          } catch (err) {
            this.dispatchEvent(new Hl7ErrorEvent(err as Error));
          }
        })
        .setEncoding(encoding ?? 'utf-8');

      socket.on('error', (err) => {
        buffer = '';
        this.dispatchEvent(new Hl7ErrorEvent(err));
      });
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
