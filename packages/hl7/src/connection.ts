// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, OperationOutcomeError, sleep, validationError } from '@medplum/core';
import iconv from 'iconv-lite';
import net from 'node:net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7CloseEvent, Hl7ErrorEvent, Hl7MessageEvent } from './events';

// iconv-lite docs have great examples and explanations for how to use Buffers with iconv-lite:
// See: https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding

export type Hl7MessageQueueItem = {
  message: Hl7Message;
  resolve: (reply: Hl7Message) => void;
  reject: (err: Error) => void;
  returnAck: ReturnAckCategory;
  timer?: NodeJS.Timeout;
};

export const ReturnAckCategory = {
  /** The first ACK message received is the one returned */
  FIRST: 'first',
  /** Only return upon receiving a positive application-level ACK (AA), or if a commit-level error occurred */
  APPLICATION: 'application',
} as const;
export type ReturnAckCategory = (typeof ReturnAckCategory)[keyof typeof ReturnAckCategory];

export interface SendAndWaitOptions {
  /** The ACK-level that the Promise should resolve on. The default is `ReturnAckCategory.ANY` (returns on the first ACK of any type). */
  returnAck?: ReturnAckCategory;
  /** The amount of milliseconds to wait before timing out when waiting for the response to a message. */
  timeoutMs?: number;
}

export interface Hl7ConnectionOptions {
  messagesPerMin?: number;
}

export const DEFAULT_ENCODING = 'utf-8';
const ONE_MINUTE = 60 * 1000;

export class Hl7Connection extends Hl7Base {
  readonly socket: net.Socket;
  encoding: string;
  enhancedMode: boolean;
  private messagesPerMin: number | undefined = undefined;
  private chunks: Buffer[] = [];
  private readonly pendingMessages: Map<string, Hl7MessageQueueItem> = new Map<string, Hl7MessageQueueItem>();
  private readonly responseQueue: Hl7MessageEvent[] = [];
  private lastMessageDispatchedTime = 0;
  private responseQueueProcessing = false;

  constructor(
    socket: net.Socket,
    encoding: string = DEFAULT_ENCODING,
    enhancedMode = false,
    options: Hl7ConnectionOptions = {}
  ) {
    super();

    this.socket = socket;
    this.encoding = encoding;
    this.enhancedMode = enhancedMode;
    this.messagesPerMin = options.messagesPerMin;

    socket.on('data', (data: Buffer) => {
      try {
        this.appendData(data);
        if (data.at(-2) === FS && data.at(-1) === CR) {
          const buffer = Buffer.concat(this.chunks);
          const contentBuffer = buffer.subarray(1, buffer.length - 2);
          const contentString = iconv.decode(contentBuffer, this.encoding);
          const message = Hl7Message.parse(contentString);
          this.responseQueue.push(new Hl7MessageEvent(this, message));
          this.resetBuffer();
          this.processResponseQueue().catch((err) => {
            this.dispatchEvent(new Hl7ErrorEvent(err));
          });
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
      const origMsgCtrlId = event.message.getSegment('MSA')?.getField(2)?.toString();
      // If there is no message control ID, just return
      if (!origMsgCtrlId) {
        return;
      }
      const queueItem = this.pendingMessages.get(origMsgCtrlId);
      if (!queueItem) {
        this.dispatchEvent(
          new Hl7ErrorEvent(
            new OperationOutcomeError({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'warning',
                  code: 'not-found',
                  details: {
                    text: 'Response received for unknown message control ID',
                  },
                  diagnostics: `Received ACK for message control ID '${origMsgCtrlId}' but there was no pending message with this control ID`,
                },
              ],
            })
          )
        );
        return;
      }
      // Check the ACK type we should return on
      const ackCode = event.message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();
      if (!ackCode) {
        return;
      }

      // Two modes:
      // Application-level or first ACK

      // First should always return on any ACK message, this is the default
      // The exception is APPLICATION, which should not resolve when the ACK is a CA, but should resolve on all other ACK types
      // On CA, we return early
      if (queueItem.returnAck === ReturnAckCategory.APPLICATION && ackCode === 'CA') {
        return;
      }

      // Resolve the promise if there is one pending for this message and we didn't exit already because the ACK type matches
      queueItem.resolve(event.message);
      this.pendingMessages.delete(origMsgCtrlId);
    });
  }

  /** @returns A boolean representing whether the socket attached to this Hl7Connection has emitted the close event already or not. */
  isClosed(): boolean {
    return this.socket.closed;
  }

  private sendImpl(reply: Hl7Message): void {
    const replyString = reply.toString();
    const replyBuffer = iconv.encode(replyString, this.encoding);
    const outputBuffer = Buffer.alloc(replyBuffer.length + 3);
    outputBuffer.writeInt8(VT, 0);
    replyBuffer.copy(outputBuffer, 1);
    outputBuffer.writeInt8(FS, replyBuffer.length + 1);
    outputBuffer.writeInt8(CR, replyBuffer.length + 2);
    this.socket.write(outputBuffer);
  }

  private async processResponseQueue(): Promise<void> {
    if (this.responseQueueProcessing) {
      return;
    }

    this.responseQueueProcessing = true;
    while (this.responseQueue.length) {
      if (this.messagesPerMin) {
        const millisBetweenMsgs = ONE_MINUTE / (this.messagesPerMin as number);
        const elapsedMillis = Date.now() - this.lastMessageDispatchedTime;
        if (millisBetweenMsgs > elapsedMillis) {
          await sleep(millisBetweenMsgs - elapsedMillis);
        }
      }
      const messageEvent = this.responseQueue.shift() as Hl7MessageEvent;
      if (messageEvent) {
        this.dispatchEvent(messageEvent);
      }
      this.lastMessageDispatchedTime = Date.now();
    }
    this.responseQueueProcessing = false;
  }

  send(reply: Hl7Message): void {
    this.sendImpl(reply);
  }

  async sendAndWait(msg: Hl7Message, options?: SendAndWaitOptions): Promise<Hl7Message> {
    return new Promise<Hl7Message>((resolve, reject) => {
      const msgCtrlId = msg.getSegment('MSH')?.getField(10)?.toString();
      if (!msgCtrlId) {
        reject(new OperationOutcomeError(validationError('Required field missing: MSH.10')));
        return;
      }

      let timer: NodeJS.Timeout | undefined;

      if (options?.timeoutMs) {
        timer = setTimeout(() => {
          this.pendingMessages.delete(msgCtrlId);
          reject(
            new OperationOutcomeError({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'error',
                  code: 'timeout',
                  details: {
                    text: 'Client timeout',
                  },
                  diagnostics: `Request timed out after waiting ${options.timeoutMs} milliseconds for response`,
                },
              ],
            })
          );
        }, options.timeoutMs);
      }

      this.pendingMessages.set(msgCtrlId, {
        message: msg,
        resolve,
        reject,
        returnAck: options?.returnAck ?? ReturnAckCategory.FIRST,
        timer,
      });
      this.sendImpl(msg);
    });
  }

  async close(): Promise<void> {
    // If we have already received the close event, then we can just return immediately
    if (this.isClosed()) {
      return Promise.resolve();
    }
    this.socket.end();
    this.socket.destroy();
    // Before clearing out messages, we should propagate a message to the consumer that we are closing the connection while some messages were still pending a response
    if (this.pendingMessages.size) {
      for (const queueItem of this.pendingMessages.values()) {
        if (queueItem.timer) {
          clearTimeout(queueItem.timer);
        }
        queueItem.reject(
          new OperationOutcomeError({
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'warning',
                code: 'incomplete',
                details: {
                  text: 'Message was still pending when connection closed',
                },
              },
            ],
          })
        );
      }
      this.dispatchEvent(
        new Hl7ErrorEvent(
          new OperationOutcomeError({
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'warning',
                code: 'incomplete',
                details: {
                  text: 'Messages were still pending when connection closed',
                },
                diagnostics: `Hl7Connection closed while ${this.pendingMessages.size} messages were pending`,
              },
            ],
          })
        )
      );
      // Clear out any pending messages
      this.pendingMessages.clear();
    }
    return new Promise((resolve) => {
      // Register a temporary listener to help resolve the promise once close has been emitted
      this.socket.once('close', resolve);
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

  setMessagesPerMin(messagesPerMin: number | undefined): void {
    this.messagesPerMin = messagesPerMin;
  }

  getMessagesPerMin(): number | undefined {
    return this.messagesPerMin;
  }
}
