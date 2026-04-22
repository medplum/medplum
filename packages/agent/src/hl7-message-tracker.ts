// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { EnhancedMode, Hl7ConnectionOptions, Hl7MessageQueueItem } from '@medplum/hl7';
import { Hl7Connection } from '@medplum/hl7';
import type { Socket } from 'node:net';

/**
 * Tracks HL7 message callbacks (pending sendAndWait promises) across the lifetime of
 * multiple connections. When a connection closes, its pending messages are NOT rejected;
 * instead they remain in the tracker so that a subsequent connection to the same remote
 * can resolve them when the ACK arrives.
 *
 * One `Hl7MessageTracker` should be shared by all connections within an agent (or pool).
 */
export class Hl7MessageTracker {
  private readonly pendingMessages = new Map<string, Hl7MessageQueueItem>();

  /**
   * Looks up a pending message by its message control ID.
   * @param msgCtrlId - The message control ID (MSH.10).
   * @returns The pending queue item, or undefined if not found.
   */
  getPendingMessage(msgCtrlId: string): Hl7MessageQueueItem | undefined {
    return this.pendingMessages.get(msgCtrlId);
  }

  /**
   * Stores a pending message by its message control ID.
   * @param msgCtrlId - The message control ID (MSH.10).
   * @param item - The queue item containing the message and its resolve/reject callbacks.
   */
  setPendingMessage(msgCtrlId: string, item: Hl7MessageQueueItem): void {
    this.pendingMessages.set(msgCtrlId, item);
  }

  /**
   * Removes a pending message by its message control ID.
   * @param msgCtrlId - The message control ID (MSH.10).
   */
  deletePendingMessage(msgCtrlId: string): void {
    this.pendingMessages.delete(msgCtrlId);
  }

  /**
   * Returns the number of pending messages currently tracked.
   * @returns The pending message count.
   */
  getPendingMessageCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Rejects all pending messages and clears the tracker.
   * Call this when the tracker is no longer needed (e.g. when the agent or pool shuts down).
   */
  drainAll(): void {
    if (!this.pendingMessages.size) {
      return;
    }
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
                text: 'Message was still pending when message tracker was closed',
              },
            },
          ],
        })
      );
    }
    this.pendingMessages.clear();
  }
}

/**
 * An `Hl7Connection` subclass that delegates all pending message operations to an
 * external `Hl7MessageTracker`. When this connection closes, pending messages are
 * NOT rejected — they remain in the tracker so another connection can resolve them.
 */
export class TrackedHl7Connection extends Hl7Connection {
  private readonly tracker: Hl7MessageTracker;

  constructor(
    socket: Socket,
    encoding: string | undefined,
    tracker: Hl7MessageTracker,
    enhancedMode?: EnhancedMode,
    options?: Hl7ConnectionOptions
  ) {
    super(socket, encoding, enhancedMode, options);
    this.tracker = tracker;
  }

  protected override getPendingMessage(msgCtrlId: string): Hl7MessageQueueItem | undefined {
    return this.tracker.getPendingMessage(msgCtrlId);
  }

  protected override setPendingMessage(msgCtrlId: string, item: Hl7MessageQueueItem): void {
    this.tracker.setPendingMessage(msgCtrlId, item);
  }

  protected override deletePendingMessage(msgCtrlId: string): void {
    this.tracker.deletePendingMessage(msgCtrlId);
  }

  /**
   * No-op: the tracker manages message lifecycle across connections.
   * Messages will be drained when the tracker itself is closed via `drainAll()`.
   */
  protected override drainPendingMessages(): void {
    // Intentionally empty — do not reject promises on connection close.
  }

  override getPendingMessageCount(): number {
    return this.tracker.getPendingMessageCount();
  }
}
