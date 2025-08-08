// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import iconv from 'iconv-lite';
import net from 'node:net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7CloseEvent, Hl7ErrorEvent, Hl7MessageEvent } from './events';

// iconv-lite docs have great examples and explanations for how to use Buffers with iconv-lite:
// See: https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding

export type Hl7MessageQueueItem = {
  message: Hl7Message;
  resolve?: (reply: Hl7Message) => void;
  reject?: (err: Error) => void;
};

export const DEFAULT_ENCODING = 'utf-8';

export class Hl7Connection extends Hl7Base {
  readonly socket: net.Socket;
  encoding: string;
  enhancedMode: boolean;
  private chunks: Buffer[] = [];
  private readonly messageQueue: Hl7MessageQueueItem[] = [];

  constructor(socket: net.Socket, encoding: string = DEFAULT_ENCODING, enhancedMode = false) {
    super();

    this.socket = socket;
    this.encoding = encoding;
    this.enhancedMode = enhancedMode;

    socket.on('data', (data: Buffer) => {
      try {
        this.appendData(data);
        if (data.at(-2) === FS && data.at(-1) === CR) {
          const buffer = Buffer.concat(this.chunks);
          const contentBuffer = buffer.subarray(1, buffer.length - 2);
          const contentString = iconv.decode(contentBuffer, this.encoding);
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

    // The difference between "end" and "close", is that "end" is only emitted on half-close from the other side
    // If the connection from the other side does not close gracefully, but instead we destroy the socket, then the Hl7Connection will not emit close
    // if we listen only for "end"; "close" is always emitted, whether the close is graceful or forceful
    socket.on('close', () => {
      this.dispatchEvent(new Hl7CloseEvent());
    });

    this.addEventListener('message', (event) => {
      if (this.enhancedMode) {
        this.send(event.message.buildAck({ ackCode: 'CA' }));
      }
      // Get the queue item at the head of the queue
      const next = this.messageQueue.shift();
      // If there isn't an item, then throw an error
      if (!next) {
        this.dispatchEvent(
          new Hl7ErrorEvent(
            new Error(`Received a message when no pending messages were in the queue. Message: ${event.message}`)
          )
        );
        return;
      }
      // Resolve the promise if there is one pending for this message
      next.resolve?.(event.message);
    });
  }

  /** @returns A boolean representing whether the socket attached to this Hl7Connection has emitted the close event already or not. */
  isClosed(): boolean {
    return this.socket.closed;
  }

  private sendImpl(reply: Hl7Message, queueItem: Hl7MessageQueueItem): void {
    this.messageQueue.push(queueItem);
    const replyString = reply.toString();
    const replyBuffer = iconv.encode(replyString, this.encoding);
    const outputBuffer = Buffer.alloc(replyBuffer.length + 3);
    outputBuffer.writeInt8(VT, 0);
    replyBuffer.copy(outputBuffer, 1);
    outputBuffer.writeInt8(FS, replyBuffer.length + 1);
    outputBuffer.writeInt8(CR, replyBuffer.length + 2);
    this.socket.write(outputBuffer);
  }

  send(reply: Hl7Message): void {
    this.sendImpl(reply, { message: reply });
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    return new Promise<Hl7Message>((resolve, reject) => {
      const queueItem = { message: msg, resolve, reject };
      this.sendImpl(msg, queueItem);
    });
  }

  async close(): Promise<void> {
    // If we have already received the close event, then we can just return immediately
    if (this.isClosed()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // Register a temporary listener to help resolve the promise once close has been emitted
      this.socket.once('close', resolve);
      this.socket.end();
      this.socket.destroy();
    });
  }

  private appendData(data: Buffer): void {
    this.chunks.push(data);
  }

  private resetBuffer(): void {
    this.chunks = [];
  }

  setEncoding(encoding: string | undefined): void {
    this.encoding = encoding ?? DEFAULT_ENCODING;
  }

  getEncoding(): string {
    return this.encoding;
  }

  setEnhancedMode(enhancedMode: boolean): void {
    this.enhancedMode = enhancedMode;
  }

  getEnhancedMode(): boolean {
    return this.enhancedMode;
  }
}
