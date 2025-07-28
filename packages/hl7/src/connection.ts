import { Hl7Message, OperationOutcomeError, validationError } from '@medplum/core';
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
};

export const ReturnAckCategory = {
  ANY: 'any',
  COMMIT: 'commit',
  APPLICATION: 'application',
} as const;
export type ReturnAckCategory = (typeof ReturnAckCategory)[keyof typeof ReturnAckCategory];

export interface SendAndWaitOptions {
  /** The ACK-level that the Promise should resolve on. The default is `ReturnAckCategory.ANY` (returns on the first ACK of any type). */
  returnAck?: ReturnAckCategory;
}

export const DEFAULT_ENCODING = 'utf-8';

export class Hl7Connection extends Hl7Base {
  readonly socket: net.Socket;
  encoding: string;
  enhancedMode: boolean;
  private chunks: Buffer[] = [];
  private readonly pendingMessages: Map<string, Hl7MessageQueueItem> = new Map<string, Hl7MessageQueueItem>();

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

    socket.on('end', () => {
      this.close();
    });

    this.addEventListener('message', (event) => {
      if (this.enhancedMode) {
        this.send(event.message.buildAck({ ackCode: 'CA' }));
      }
      // Check if we have messages pending a response in the pending messages map
      if (!this.pendingMessages.size) {
        return;
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

      // If application-level return ACK or commit-level return ACK categories are specified, and the ACK code doesn't match, return
      // Otherwise if ReturnAckCategory matches or is ANY, then resolve the queueItem promise
      if (
        (queueItem.returnAck === ReturnAckCategory.APPLICATION && !ackCode.startsWith('A')) ||
        (queueItem.returnAck === ReturnAckCategory.COMMIT && !ackCode.startsWith('C'))
      ) {
        return;
      }

      // Resolve the promise if there is one pending for this message and we didn't exit already because the ACK type matches
      queueItem.resolve(event.message);
      this.pendingMessages.delete(origMsgCtrlId);
    });
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
      this.pendingMessages.set(msgCtrlId, {
        message: msg,
        resolve,
        reject,
        returnAck: options?.returnAck ?? ReturnAckCategory.ANY,
      });
      this.sendImpl(msg);
    });
  }

  close(): void {
    this.socket.end();
    this.socket.destroy();
    // Before clearing out messages, we should propagate a message to the consumer that we are closing the connection while some messages were still pending a response
    if (this.pendingMessages.size) {
      this.dispatchEvent(
        new Hl7ErrorEvent(
          new OperationOutcomeError({
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'warning',
                code: 'incomplete',
                details: {
                  text: 'Messages incomplete',
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
    this.dispatchEvent(new Hl7CloseEvent());
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
