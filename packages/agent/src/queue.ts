// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message } from '@medplum/core';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MESSAGE_DB_PATH = join(__dirname, 'messages.sqlite3');

export const MESSAGE_STATUSES = [
  'received',
  'sent',
  'timed_out',
  'error',
  'commit_acked',
  'app_acked',
  'response_queued',
  'response_sent',
  'response_timed_out',
  'response_error',
] as const;

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS hl7_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_time DATETIME NOT NULL,
  raw_message TEXT NOT NULL,
  sender TEXT,
  receiver TEXT,
  message_id TEXT,
  channel TEXT,
  remote TEXT,
  callback TEXT,
  status TEXT NOT NULL CHECK(status IN (${MESSAGE_STATUSES.map((status) => `'${status}'`).join(',')})),
  current_retries INTEGER DEFAULT 0,
  last_retry DATETIME,
  queued_time DATETIME,
  sent_time DATETIME,
  timed_out_time DATETIME,
  error_time DATETIME,
  commit_acked_time DATETIME,
  app_acked_time DATETIME,
  response_message TEXT,
  response_queued_time DATETIME,
  response_sent_time DATETIME,
  response_timed_out_time DATETIME,
  response_error_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
];

export class AgentHl7DurableQueue {
  private readonly db: DatabaseSync;
  private readonly insertMessageStmt;
  private readonly insertMessageWithCallbackStmt;
  private readonly getNextMessageStmt;
  private readonly getNextReceivedMessageStmt;
  private readonly getNextResponseQueuedMessageStmt;
  private readonly getMessageByCallbackStmt;
  private readonly getMessageByRemoteStmt;
  private readonly markQueuedStmt;
  private readonly markSentStmt;
  private readonly markCommitAckedStmt;
  private readonly markAppAckedStmt;
  private readonly markErrorStmt;
  private readonly markTimedOutStmt;
  private readonly markResponseQueuedStmt;
  private readonly markResponseSentStmt;
  private readonly markResponseTimedOutStmt;
  private readonly markResponseErrorStmt;
  private readonly countByStatusStmt;

  constructor() {
    this.db = new DatabaseSync(MESSAGE_DB_PATH);
    for (const migration of MIGRATIONS) {
      this.db.exec(migration);
    }

    // Prepare statements for better performance
    this.insertMessageStmt = this.db.prepare(
      `INSERT INTO hl7_messages (received_time, raw_message, sender, receiver, message_id, channel, status)
       VALUES (?, ?, ?, ?, ?, ?, 'received')`
    );

    this.insertMessageWithCallbackStmt = this.db.prepare(
      `INSERT INTO hl7_messages (received_time, raw_message, sender, receiver, message_id, channel, remote, callback, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received')`
    );

    this.getNextMessageStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_id, channel FROM hl7_messages
      WHERE status IN ('received', 'timed_out')
      ORDER BY received_time ASC
      LIMIT 1`
    );

    this.getNextReceivedMessageStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_id, channel, remote, callback FROM hl7_messages
       WHERE status = 'received'
       ORDER BY received_time ASC
       LIMIT 1`
    );

    this.getNextResponseQueuedMessageStmt = this.db.prepare(
      `SELECT id, raw_message, response_message, channel, remote, callback FROM hl7_messages
       WHERE status = 'response_queued'
       ORDER BY response_queued_time ASC
       LIMIT 1`
    );

    this.getMessageByCallbackStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_id, channel, remote, callback, status FROM hl7_messages
       WHERE callback = ?
       LIMIT 1`
    );

    this.getMessageByRemoteStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_id, channel, remote, callback, status FROM hl7_messages
       WHERE remote = ?
       LIMIT 1`
    );

    this.markQueuedStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'queued', queued_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markSentStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'sent', sent_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markCommitAckedStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'commit_acked', commit_acked_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markAppAckedStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'app_acked', app_acked_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markErrorStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'error', error_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markTimedOutStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'timed_out', timed_out_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markResponseQueuedStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'response_queued', response_message = ?, response_queued_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markResponseSentStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'response_sent', response_sent_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markResponseTimedOutStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'response_timed_out', response_timed_out_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.markResponseErrorStmt = this.db.prepare(
      `UPDATE hl7_messages
       SET status = 'response_error', response_error_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    this.countByStatusStmt = this.db.prepare(`SELECT COUNT(*) as count FROM hl7_messages WHERE status = ?`);
  }

  /**
   * Add a message to the queue with metadata from the MSH segment.
   * @param message - The HL7 message to add to the queue.
   * @param channel - The channel the message is being sent to.
   * @param remote - The remote address the message is being sent to.
   * @param callback - The callback ID for the message.
   * @returns The ID of the message that was added to the queue.
   */
  addMessage(message: Hl7Message, channel: string, remote: string, callback?: string): number {
    const receivedTime = Date.now();
    const rawMessage = message.toString();
    const msh = message.getSegment('MSH');
    const sender = msh?.getField(3)?.toString() ?? '';
    const receiver = msh?.getField(5)?.toString() ?? '';
    const messageId = msh?.getField(10)?.toString() ?? '';

    const result = callback
      ? this.insertMessageWithCallbackStmt.run(
          receivedTime,
          rawMessage,
          sender,
          receiver,
          messageId,
          channel,
          remote,
          callback
        )
      : this.insertMessageStmt.run(receivedTime, rawMessage, sender, receiver, messageId, channel);

    return result.lastInsertRowid as number;
  }

  /**
   * Get the next message to process.
   * Returns messages with status 'received' or 'timed_out', ordered by received time
   * @param channel - The channel to get the next message for.
   * @returns The next message to process, or undefined if no message is available.
   */
  getNextMessage(channel: string):
    | {
        id: number;
        raw_message: string;
        sender: string;
        receiver: string;
        message_id: string;
        channel: string;
      }
    | undefined {
    return this.getNextMessageStmt.get(channel) as {
      id: number;
      raw_message: string;
      sender: string;
      receiver: string;
      message_id: string;
      channel: string;
    };
  }

  /**
   * Mark a message as queued and set the queue time.
   * @param messageId - The ID of the message to mark as queued.
   */
  markAsQueued(messageId: number): void {
    const queuedTime = Date.now();
    this.markQueuedStmt.run(queuedTime, messageId);
  }

  /**
   * Mark a message as sent and set the sent time.
   * @param messageId - The ID of the message to mark as sent.
   */
  markAsSent(messageId: number): void {
    const sentTime = Date.now();
    this.markSentStmt.run(sentTime, messageId);
  }

  /**
   * Mark a message as commit_acked and set the commit ack time.
   * @param messageId - The ID of the message to mark as commit_acked.
   */
  markAsCommitAcked(messageId: number): void {
    const ackTime = Date.now();
    this.markCommitAckedStmt.run(ackTime, messageId);
  }

  /**
   * Mark a message as app_acked and set the app ack time
   * @param messageId - The ID of the message to mark as app_acked.
   */
  markAsAppAcked(messageId: number): void {
    const ackTime = Date.now();
    this.markAppAckedStmt.run(ackTime, messageId);
  }

  /**
   * Mark a message as error and set the error time
   * @param messageId - The ID of the message to mark as error.
   */
  markAsError(messageId: number): void {
    const errorTime = Date.now();
    this.markErrorStmt.run(errorTime, messageId);
  }

  /**
   * Mark a message as timed_out and set the timed_out time.
   * @param messageId - The ID of the message to mark as timed_out.
   */
  markAsTimedOut(messageId: number): void {
    const timedOutTime = Date.now();
    this.markTimedOutStmt.run(timedOutTime, messageId);
  }

  /**
   * Mark a message as response_sent and set the sent time.
   * @param messageId - The ID of the message to mark as response_sent.
   */
  markAsResponseSent(messageId: number): void {
    const sentTime = Date.now();
    this.markResponseSentStmt.run(sentTime, messageId);
  }

  /**
   * Mark a message as response_timed_out and set the timed out time.
   * @param messageId - The ID of the message to mark as response_timed_out.
   */
  markAsResponseTimedOut(messageId: number): void {
    const timedOutTime = Date.now();
    this.markResponseTimedOutStmt.run(timedOutTime, messageId);
  }

  /**
   * Mark a message as response_queued and store the response message.
   * @param messageId - The ID of the message to mark as response_queued.
   * @param responseMessage - The response message to store.
   */
  markAsResponseQueued(messageId: number, responseMessage: string): void {
    const queuedTime = Date.now();
    this.markResponseQueuedStmt.run(responseMessage, queuedTime, messageId);
  }

  /**
   * Mark a message as response_error and set the error time.
   * @param messageId - The ID of the message to mark as response_error.
   */
  markAsResponseError(messageId: number): void {
    const errorTime = Date.now();
    this.markResponseErrorStmt.run(errorTime, messageId);
  }

  /**
   * Get the next message that needs to be sent to WebSocket (status = 'received')
   * @returns The next message to send to WebSocket, or undefined if no message is available.
   */
  getNextReceivedMessage():
    | {
        id: number;
        raw_message: string;
        sender: string;
        receiver: string;
        message_id: string;
        channel: string;
        remote: string;
        callback: string;
      }
    | undefined {
    return this.getNextReceivedMessageStmt.get() as
      | {
          id: number;
          raw_message: string;
          sender: string;
          receiver: string;
          message_id: string;
          channel: string;
          remote: string;
          callback: string;
        }
      | undefined;
  }

  /**
   * Get the next response message that needs to be sent back (status = 'response_queued')
   * @returns The next response message to send back, or undefined if no message is available.
   */
  getNextResponseQueuedMessage():
    | {
        id: number;
        raw_message: string;
        response_message: string;
        channel: string;
        remote: string;
        callback: string;
      }
    | undefined {
    return this.getNextResponseQueuedMessageStmt.get() as
      | {
          id: number;
          raw_message: string;
          response_message: string;
          channel: string;
          remote: string;
          callback: string;
        }
      | undefined;
  }

  /**
   * Get a message by its callback ID
   * @param callback - The callback ID to get the message by.
   * @returns The message by its callback ID, or undefined if no message is available.
   */
  getMessageByCallback(callback: string):
    | {
        id: number;
        raw_message: string;
        sender: string;
        receiver: string;
        message_id: string;
        channel: string;
        remote: string;
        callback: string;
        status: (typeof MESSAGE_STATUSES)[number];
      }
    | undefined {
    return this.getMessageByCallbackStmt.get(callback) as
      | {
          id: number;
          raw_message: string;
          sender: string;
          receiver: string;
          message_id: string;
          channel: string;
          remote: string;
          callback: string;
          status: (typeof MESSAGE_STATUSES)[number];
        }
      | undefined;
  }

  /**
   * Get a message by its remote identifier
   * @param remote - The remote identifier to get the message by.
   * @returns The message by its remote identifier, or undefined if no message is available.
   */
  getMessageByRemote(remote: string):
    | {
        id: number;
        raw_message: string;
        sender: string;
        receiver: string;
        message_id: string;
        channel: string;
        remote: string;
        callback: string;
        status: (typeof MESSAGE_STATUSES)[number];
      }
    | undefined {
    return this.getMessageByRemoteStmt.get(remote) as
      | {
          id: number;
          raw_message: string;
          sender: string;
          receiver: string;
          message_id: string;
          channel: string;
          remote: string;
          callback: string;
          status: (typeof MESSAGE_STATUSES)[number];
        }
      | undefined;
  }

  /**
   * Count messages by status.
   * @param status - The status to count messages by.
   * @returns The number of messages by status.
   */
  countByStatus(status: (typeof MESSAGE_STATUSES)[number]): number {
    const result = this.countByStatusStmt.get(status) as { count: number };
    return result?.count ?? 0;
  }
}
