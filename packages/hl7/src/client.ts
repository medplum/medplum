import { Hl7Message } from '@medplum/core';
import { connect, Socket } from 'net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7MessageEvent } from './events';

export interface Hl7ClientOptions {
  host: string;
  port: number;
}

export class Hl7Client extends Hl7Base {
  options: Hl7ClientOptions;
  host: string;
  port: number;
  socket?: Socket;
  buffer: string;
  awaitingResponse: boolean;

  constructor(options: Hl7ClientOptions) {
    super();
    this.options = options;
    this.host = this.options.host;
    this.port = this.options.port;
    this.buffer = '';
    this.awaitingResponse = false;
  }

  connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port }, () => {
        socket.on('data', (data) => {
          this.buffer += data.toString();
          if (this.buffer.endsWith(FS + CR)) {
            const msg = Hl7Message.parse(this.buffer.substring(1, this.buffer.length - 2));
            this.dispatchEvent(new Hl7MessageEvent(socket, msg));
            this.buffer = '';
            this.awaitingResponse = false;
          }
        });
        resolve(socket);
      });

      socket.on('error', function (err) {
        reject(err);
      });

      this.socket = socket;
    });
  }

  async send(msg: Hl7Message): Promise<void> {
    if (this.awaitingResponse) {
      throw new Error("Can't send while awaiting response");
    }
    this.awaitingResponse = true;
    let socket = this.socket;
    if (!socket) {
      socket = await this.connect();
    }
    socket.write(VT + msg.toString() + FS + CR);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    const promise = new Promise<Hl7Message>((resolve) => {
      function handler(event: Hl7MessageEvent): void {
        (event.target as Hl7Client).removeEventListener('message', handler);
        resolve(event.message);
      }

      this.addEventListener('message', handler);
    });

    await this.send(msg);
    return promise;
  }

  close(): void {
    if (this.socket) {
      this.buffer = '';
      this.awaitingResponse = false;
      this.socket.end();
      this.socket.destroy();
      delete this.socket;
    }
  }
}
