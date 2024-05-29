import { Hl7Message } from '@medplum/core';
import { decode, encode } from 'iconv-lite';
import net from 'node:net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7ErrorEvent, Hl7MessageEvent } from './events';

// iconv-lite docs have great examples and explanations for how to use Buffers with iconv-lite:
// See: https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding

export class Hl7Connection extends Hl7Base {
  private chunks: Buffer[] = [];

  constructor(
    readonly socket: net.Socket,
    readonly encoding: string = 'utf-8'
  ) {
    super();

    socket.on('data', (data: Buffer) => {
      try {
        this.appendData(data);
        if (data.at(-2) === FS && data.at(-1) === CR) {
          const buffer = Buffer.concat(this.chunks);
          const contentBuffer = buffer.subarray(1, buffer.length - 2);
          const contentString = decode(contentBuffer, this.encoding);
          const message = Hl7Message.parse(contentString);
          this.dispatchEvent(new Hl7MessageEvent(this, message));
          this.resetBuffer();
        }
      } catch (err) {
        this.dispatchEvent(new Hl7ErrorEvent(err as Error));
      }
    });

    socket.on('error', (err) => {
      this.resetBuffer();
      this.dispatchEvent(new Hl7ErrorEvent(err));
    });
  }

  send(reply: Hl7Message): void {
    const replyString = reply.toString();
    const replyBuffer = encode(replyString, this.encoding);
    const outputBuffer = Buffer.alloc(replyBuffer.length + 3);
    outputBuffer.writeInt8(VT, 0);
    replyBuffer.copy(outputBuffer, 1);
    outputBuffer.writeInt8(FS, replyBuffer.length + 1);
    outputBuffer.writeInt8(CR, replyBuffer.length + 2);
    this.socket.write(outputBuffer);
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

  private appendData(data: Buffer): void {
    this.chunks.push(data);
  }

  private resetBuffer(): void {
    this.chunks = [];
  }
}
