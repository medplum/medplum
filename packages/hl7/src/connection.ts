import { Hl7Message } from '@medplum/core';
import net from 'net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7ErrorEvent, Hl7MessageEvent } from './events';

export class Hl7Connection extends Hl7Base {
  constructor(readonly socket: net.Socket, readonly encoding?: BufferEncoding) {
    super();

    let buffer = '';

    socket
      .on('data', (data) => {
        try {
          buffer += data.toString();
          if (buffer.endsWith(FS + CR)) {
            const message = Hl7Message.parse(buffer.substring(1, buffer.length - 2));
            this.dispatchEvent(new Hl7MessageEvent(this, message));
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
  }

  send(reply: Hl7Message): void {
    this.socket.write(VT + reply.toString() + FS + CR);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    const promise = new Promise<Hl7Message>((resolve) => {
      function handler(event: Hl7MessageEvent): void {
        (event.target as Hl7Connection).removeEventListener('message', handler);
        resolve(event.message);
      }
      this.addEventListener('message', handler);
    });

    this.send(msg);
    return promise;
  }

  close(): void {
    this.socket.end();
    this.socket.destroy();
  }
}
