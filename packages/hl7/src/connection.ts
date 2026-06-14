// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AckCode } from '@medplum/core';
import { Hl7Message, OperationOutcomeError, ReturnAckCategory, sleep, validationError } from '@medplum/core';
import iconv from 'iconv-lite';
import type net from 'node:net';
import { Hl7Base } from './base';
import { CR, FS, VT } from './constants';
import { Hl7CloseEvent, Hl7EnhancedAckSentEvent, Hl7ErrorEvent, Hl7MessageEvent, Hl7WarningEvent } from './events';

/**
 * Negative commit ACK code accepted by {@link Hl7Connection.nackCommit}.
 *
 * By HL7 convention the *error* codes are retryable (the peer may retransmit and
 * could succeed) while the *reject* codes are terminal (retransmitting the same
 * message will fail identically, so the peer must not retry):
 *
 * - `CE` — Commit Error (standard enhanced): retryable, e.g. a transient storage failure.
 * - `AE` — Application Error (aaMode): retryable.
 * - `CR` — Commit Reject (standard enhanced): terminal, e.g. a rejected duplicate.
 * - `AR` — Application Reject (aaMode): terminal.
 */
export type NackCommitCode = 'CR' | 'CE' | 'AR' | 'AE';

/** Upper bound on the size of the deferred-ack idempotency set. */
const ACKED_CONTROL_IDS_MAX = 10_000;

// Export `ReturnAckCategory` for backwards-compat
export { ReturnAckCategory } from '@medplum/core';

// iconv-lite docs have great examples and explanations for how to use Buffers with iconv-lite:
// See: https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding

export type Hl7MessageQueueItem = {
  message: Hl7Message;
  resolve: (reply: Hl7Message) => void;
  reject: (err: Error) => void;
  returnAck: ReturnAckCategory;
  timer?: NodeJS.Timeout;
};

export interface SendAndWaitOptions {
  /** The ACK-level that the Promise should resolve on. The default is `ReturnAckCategory.APPLICATION` (returns on the first application-level ACK). */
  returnAck?: ReturnAckCategory;
  /** The amount of milliseconds to wait before timing out when waiting for the response to a message. */
  timeoutMs?: number;
}

export interface Hl7ConnectionOptions {
  messagesPerMin?: number;
  gracefulCloseTimeoutMs?: number;
}

/**
 * Enhanced mode for HL7 connections.
 * - `'standard'`: Standard enhanced mode behavior
 * - `'aaMode'`: AA mode - special enhanced mode that only accepts AA acknowledgements
 * - `undefined`: Enhanced mode is not enabled (standard behavior)
 */
export type EnhancedMode = 'standard' | 'aaMode' | undefined;

export const DEFAULT_ENCODING = 'utf-8';
export const GRACEFUL_CLOSE_TIMEOUT_MS = 5000;
const ONE_MINUTE = 60 * 1000;

export class Hl7Connection extends Hl7Base {
  readonly socket: net.Socket;
  encoding: string;
  enhancedMode: EnhancedMode = undefined;
  private messagesPerMin: number | undefined = undefined;
  private gracefulCloseTimeoutMs: number;
  private chunks: Buffer[] = [];
  private readonly pendingMessages: Map<string, Hl7MessageQueueItem> = new Map<string, Hl7MessageQueueItem>();
  private readonly responseQueue: Hl7MessageEvent[] = [];
  private lastMessageDispatchedTime = 0;
  private responseQueueProcessing = false;
  private closing = false;
  private deferredCommitAck = false;
  // Bounded FIFO of MSH.10s we've already (n)acked under deferred mode.
  // Used to make ackCommit/nackCommit idempotent so the wire only sees one ACK
  // per inbound message even if upstream code retries.
  private readonly ackedControlIds: Set<string> = new Set<string>();

  constructor(
    socket: net.Socket,
    encoding: string = DEFAULT_ENCODING,
    enhancedMode?: EnhancedMode,
    options: Hl7ConnectionOptions = {}
  ) {
    super();

    this.socket = socket;
    this.encoding = encoding;
    this.enhancedMode = enhancedMode;
    this.messagesPerMin = options.messagesPerMin;
    this.gracefulCloseTimeoutMs = options.gracefulCloseTimeoutMs ?? GRACEFUL_CLOSE_TIMEOUT_MS;

    socket.on('data', (data: Buffer) => {
      if (this.closing) {
        this.dispatchEvent(
          new Hl7WarningEvent(
            new OperationOutcomeError({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'warning',
                  code: 'transient',
                  details: {
                    text: 'Data received after close was initiated',
                  },
                },
              ],
            })
          )
        );
        return;
      }
      try {
        this.appendData(data);
        const messages = this.parseMessages();
        for (const message of messages) {
          this.responseQueue.push(new Hl7MessageEvent(this, message));
        }
        this.processResponseQueue().catch((err) => {
          this.dispatchEvent(new Hl7ErrorEvent(err));
        });
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
      // Reject any messages that were still pending when the connection was closed externally (e.g. closed by peer)
      this.drainPendingMessages();
      this.dispatchEvent(new Hl7CloseEvent());
    });

    this.addEventListener('message', (event) => {
      // In standard enhanced mode, send commit ACK (CA) immediately, then later forward app-level ACKs
      // In aaMode, send application ACK (AA) immediately, then ignore any later app-level ACKs
      // When deferredCommitAck is on, the application is responsible for calling ackCommit/nackCommit
      // after it has durably committed (or rejected) the message.
      let response: Hl7Message | undefined;
      if (!this.deferredCommitAck) {
        if (this.enhancedMode === 'standard') {
          response = event.message.buildAck({ ackCode: 'CA' });
        } else if (this.enhancedMode === 'aaMode') {
          response = event.message.buildAck({ ackCode: 'AA' });
        }
      }
      if (response) {
        this.send(response);
        this.dispatchEvent(new Hl7EnhancedAckSentEvent(this, response));
      }
      const origMsgCtrlId = event.message.getSegment('MSA')?.getField(2)?.toString();
      // If there is no message control ID, just return
      if (!origMsgCtrlId) {
        return;
      }
      const queueItem = this.getPendingMessage(origMsgCtrlId);
      if (!queueItem) {
        this.dispatchEvent(
          new Hl7WarningEvent(
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
      if (queueItem.timer) {
        clearTimeout(queueItem.timer);
      }
      queueItem.resolve(event.message);
      this.deletePendingMessage(origMsgCtrlId);
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
        const millisBetweenMsgs = ONE_MINUTE / this.messagesPerMin;
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

  /**
   * Parses complete HL7 messages from the accumulated buffer.
   * Continues parsing while the buffer starts with VT and contains FS+CR.
   * Keeps any incomplete message data in the buffer for the next chunk.
   * @returns An array of parsed HL7 messages.
   */
  private parseMessages(): Hl7Message[] {
    const messages: Hl7Message[] = [];
    const buffer = Buffer.concat(this.chunks);
    this.resetBuffer();

    // Check if buffer starts with VT (Vertical Tab)
    if (buffer.length === 0) {
      return messages;
    }

    let bufferIdx = 0;

    // Keep parsing while we have complete messages
    while (bufferIdx < buffer.length) {
      // Ignore bytes between message frames
      while (buffer[bufferIdx] !== VT && bufferIdx < buffer.length) {
        bufferIdx++;
      }

      // Look for FS+CR sequence to mark end of message
      let messageEndIndex = -1;

      for (let i = bufferIdx + 1; i < buffer.length - 1; i++) {
        if (buffer[i] === FS && buffer[i + 1] === CR) {
          messageEndIndex = i + 1; // Index of CR (end of message)
          break;
        }
      }

      // If we don't have a complete message yet, wait for more data
      if (messageEndIndex === -1) {
        break;
      }

      // Extract the complete message (including VT, FS, and CR)
      const messageBuffer = buffer.subarray(bufferIdx, messageEndIndex + 1);
      // Extract the content (without VT at start and FS+CR at end)
      const contentBuffer = messageBuffer.subarray(1, -2);
      const contentString = iconv.decode(contentBuffer, this.encoding);
      const message = Hl7Message.parse(contentString);

      messages.push(message);

      // Move past this message
      bufferIdx = messageEndIndex + 1;
    }

    // Keep any remaining unfinished chunk in this.chunks
    this.chunks = bufferIdx < buffer.length ? [buffer.subarray(bufferIdx)] : [];

    return messages;
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
          this.deletePendingMessage(msgCtrlId);
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

      this.setPendingMessage(msgCtrlId, {
        message: msg,
        resolve,
        reject,
        returnAck: options?.returnAck ?? ReturnAckCategory.APPLICATION,
        timer,
      });
      this.sendImpl(msg);
    });
  }

  async close(): Promise<void> {
    // If we have already received the close event, then we can just return immediately
    if (this.isClosed()) {
      return;
    }
    this.closing = true;
    this.socket.end();
    // drainPendingMessages is also called by the socket 'close' handler, but we call it here first so
    // that rejections are delivered before the close event is dispatched when close() is called explicitly.
    // The socket 'close' handler's call will be a no-op since the map will already be empty.
    this.drainPendingMessages();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
      }, this.gracefulCloseTimeoutMs);

      this.socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Rejects all pending sendAndWait promises and clears the pending messages map.
   * Safe to call multiple times — subsequent calls are no-ops once the map is empty.
   *
   * Subclasses may override this to change the behavior when a connection closes
   * (e.g. to keep promises alive in an external tracker).
   */
  protected drainPendingMessages(): void {
    if (!this.pendingMessages.size) {
      return;
    }
    const pendingCount = this.pendingMessages.size;
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
              diagnostics: `Hl7Connection closed while ${pendingCount} messages were pending`,
            },
          ],
        })
      )
    );
    this.pendingMessages.clear();
  }

  private appendData(data: Buffer): void {
    this.chunks.push(data);
  }

  private resetBuffer(): void {
    this.chunks = [];
  }

  /**
   * Enables or disables deferred commit-ACK mode.
   *
   * When `deferred` is true, the connection will not auto-send CA/AA on message receipt;
   * the application MUST call {@link Hl7Connection.ackCommit} or {@link Hl7Connection.nackCommit}
   * after it has durably committed (or rejected) the inbound message. This is the hook
   * the Medplum Agent's durable inbound queue uses to back the enhanced-mode CA promise
   * with an actual on-disk write.
   *
   * Only meaningful when {@link Hl7Connection.enhancedMode} is set. When `enhancedMode`
   * is undefined this flag has no effect (no ACK is auto-sent in either case).
   *
   * Toggling the flag clears the internal idempotency set so a fresh session of
   * (n)acks can be tracked.
   * @param deferred - True to suppress auto-ACK; false to restore default behavior.
   */
  setDeferredCommitAck(deferred: boolean): void {
    this.deferredCommitAck = deferred;
    this.ackedControlIds.clear();
  }

  /** @returns Whether deferred commit-ACK mode is currently enabled. */
  getDeferredCommitAck(): boolean {
    return this.deferredCommitAck;
  }

  /**
   * Sends the configured commit ACK (CA in `standard` enhanced mode, AA in `aaMode`)
   * for the supplied inbound message.
   *
   * No-op (and no wire write) in these cases:
   * - `enhancedMode` is undefined (no commit ACK is part of the protocol).
   * - The same MSH.10 has already been (n)acked under this connection's deferred session.
   *
   * @param message - The original inbound message to ACK.
   */
  ackCommit(message: Hl7Message): void {
    if (!this.enhancedMode) {
      return;
    }
    const controlId = message.getSegment('MSH')?.getField(10)?.toString();
    if (controlId && !this.recordAcked(controlId)) {
      return;
    }
    const ackCode: AckCode = this.enhancedMode === 'standard' ? 'CA' : 'AA';
    const response = message.buildAck({ ackCode });
    this.send(response);
    this.dispatchEvent(new Hl7EnhancedAckSentEvent(this, response));
  }

  /**
   * Sends a negative commit ACK for the supplied inbound message. The wire-level code is:
   * - `standard` enhanced mode: `CE` (retryable error) or `CR` (terminal reject).
   * - `aaMode`: `AE` (retryable error) or `AR` (terminal reject).
   *
   * Passing a code that doesn't match the connection's enhanced mode is permitted —
   * the caller decides which code best describes the failure. An optional `reason`
   * is recorded in MSA.3 of the outgoing ACK for the sender's logs.
   *
   * Retryable error codes (`CE`/`AE`) explicitly invite the peer to retransmit, so
   * they do NOT consume the already-acked slot for this control ID — the eventual
   * successful retry must still be able to send its own commit ACK. Terminal
   * rejects (`CR`/`AR`) do claim the slot, so a duplicate retransmit of a rejected
   * message is suppressed rather than double-nacked.
   *
   * No-op (and no wire write) in these cases:
   * - `enhancedMode` is undefined.
   * - The same MSH.10 has already been (n)acked under this deferred session AND
   *   the code is terminal.
   *
   * @param message - The original inbound message to NACK.
   * @param code - The negative ACK code to send.
   * @param reason - Optional human-readable explanation placed in MSA.3.
   */
  nackCommit(message: Hl7Message, code: NackCommitCode, reason?: string): void {
    if (!this.enhancedMode) {
      return;
    }
    const retryable = code === 'CE' || code === 'AE';
    const controlId = message.getSegment('MSH')?.getField(10)?.toString();
    if (controlId && !retryable && !this.recordAcked(controlId)) {
      return;
    }
    const response = message.buildAck({ ackCode: code });
    if (reason) {
      // Overwrite the default MSA.3 text (e.g. "Commit Reject") with the supplied reason.
      response.getSegment('MSA')?.setField(3, reason);
    }
    this.send(response);
    this.dispatchEvent(new Hl7EnhancedAckSentEvent(this, response));
  }

  /**
   * Records that we've sent a deferred-mode ACK for `controlId`. Returns true if the
   * caller should proceed with the send, false if the control ID was already acked.
   *
   * The set is bounded; once it reaches `ACKED_CONTROL_IDS_MAX` the oldest entry is
   * evicted. The bound is generous enough to cover real-world bursts but prevents
   * unbounded growth on a long-lived connection.
   * @param controlId - MSH.10 of the inbound message being (n)acked.
   * @returns True if this is a fresh ack the caller should proceed with; false if it was already acked.
   */
  private recordAcked(controlId: string): boolean {
    if (this.ackedControlIds.has(controlId)) {
      return false;
    }
    if (this.ackedControlIds.size >= ACKED_CONTROL_IDS_MAX) {
      const oldest = this.ackedControlIds.values().next().value;
      if (oldest !== undefined) {
        this.ackedControlIds.delete(oldest);
      }
    }
    this.ackedControlIds.add(controlId);
    return true;
  }

  setEncoding(encoding: string | undefined): void {
    this.encoding = encoding ?? DEFAULT_ENCODING;
  }

  getEncoding(): string {
    return this.encoding;
  }

  setEnhancedMode(enhancedMode: EnhancedMode): void {
    this.enhancedMode = enhancedMode;
  }

  getEnhancedMode(): EnhancedMode {
    return this.enhancedMode;
  }

  setMessagesPerMin(messagesPerMin: number | undefined): void {
    this.messagesPerMin = messagesPerMin;
  }

  getMessagesPerMin(): number | undefined {
    return this.messagesPerMin;
  }

  getPendingMessageCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Looks up a pending message by its message control ID.
   * Subclasses may override this to use an external message store (e.g. a shared tracker).
   * @param msgCtrlId - The message control ID (MSH.10) to look up.
   * @returns The pending queue item, or undefined if not found.
   */
  protected getPendingMessage(msgCtrlId: string): Hl7MessageQueueItem | undefined {
    return this.pendingMessages.get(msgCtrlId);
  }

  /**
   * Stores a pending message by its message control ID.
   * Subclasses may override this to use an external message store (e.g. a shared tracker).
   * @param msgCtrlId - The message control ID (MSH.10).
   * @param item - The queue item containing the message and its resolve/reject callbacks.
   */
  protected setPendingMessage(msgCtrlId: string, item: Hl7MessageQueueItem): void {
    this.pendingMessages.set(msgCtrlId, item);
  }

  /**
   * Removes a pending message by its message control ID.
   * Subclasses may override this to use an external message store (e.g. a shared tracker).
   * @param msgCtrlId - The message control ID (MSH.10) to remove.
   */
  protected deletePendingMessage(msgCtrlId: string): void {
    this.pendingMessages.delete(msgCtrlId);
  }
}
