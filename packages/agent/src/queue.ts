// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger } from '@medplum/core';
import { sleep } from '@medplum/core';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { checkProcessExists } from './pid';

// Type alias for prepared statements
type PreparedStatement = ReturnType<DatabaseSync['prepare']>;

export const CURRENT_SQLITE_FILE_VERSION = 1;
export const MESSAGE_DB_PATH = join(__dirname, `messages-v${CURRENT_SQLITE_FILE_VERSION}.sqlite3`);
export const QUEUE_OWNER_PATH = join(__dirname, '.queue-owner');

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

// Queue message types for query results
export interface QueueMessage {
  id: number;
  raw_message: string;
  sender: string;
  receiver: string;
  message_ctrl_id: string;
  channel: string;
}

export interface QueueMessageWithRemote extends QueueMessage {
  remote: string;
  callback: string;
}

export interface QueueResponseMessage {
  id: number;
  raw_message: string;
  response_message: string;
  channel: string;
  remote: string;
  callback: string;
}

export interface QueueMessageWithStatus extends QueueMessageWithRemote {
  status: (typeof MESSAGE_STATUSES)[number];
}

export const MIGRATIONS = [
  [
    `CREATE TABLE IF NOT EXISTS hl7_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_time DATETIME NOT NULL,
  raw_message TEXT NOT NULL,
  sender TEXT,
  receiver TEXT,
  message_ctrl_id TEXT,
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
    // Performance indexes for common query patterns
    `CREATE INDEX IF NOT EXISTS idx_hl7_messages_status ON hl7_messages(status);`,
    `CREATE INDEX IF NOT EXISTS idx_hl7_messages_status_received_time ON hl7_messages(status, received_time);`,
    `CREATE INDEX IF NOT EXISTS idx_hl7_messages_callback ON hl7_messages(callback) WHERE callback IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_hl7_messages_remote ON hl7_messages(remote) WHERE remote IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_hl7_messages_channel_status ON hl7_messages(channel, status, received_time);`,
    // Mark that we've applied the latest
    `INSERT INTO migrations (id) VALUES (0);`,
  ],
];

/**
 * Wait for any previous queue owner to release the database.
 * This is used during upgrades to ensure the old agent has closed the database
 * before the new agent opens it.
 * @param log - Logger instance for status messages.
 * @param timeoutMs - Maximum time to wait in milliseconds (default 30 seconds).
 */
export async function waitForQueueRelease(log: ILogger, timeoutMs = 30000): Promise<void> {
  if (!existsSync(QUEUE_OWNER_PATH)) {
    log.info('No existing queue owner, proceeding with queue initialization');
    return;
  }

  const startTime = Date.now();
  log.info('Waiting for previous queue owner to release...');

  while (existsSync(QUEUE_OWNER_PATH)) {
    // Check if the owner process is still running
    try {
      const ownerPidStr = readFileSync(QUEUE_OWNER_PATH, 'utf8').trim();
      const ownerPid = parseInt(ownerPidStr, 10);

      if (!Number.isNaN(ownerPid) && !checkProcessExists(ownerPid)) {
        // Owner process is gone, stale marker - safe to remove
        log.info(`Stale queue owner file (PID ${ownerPid} not running), removing`);
        unlinkSync(QUEUE_OWNER_PATH);
        return;
      }
    } catch (err) {
      // Error reading file, might be race condition - retry
      log.warn(`Error checking queue owner: ${(err as Error).message}`);
    }

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      log.warn(`Timeout waiting for queue release after ${timeoutMs}ms, proceeding anyway`);
      // Force remove stale marker
      if (existsSync(QUEUE_OWNER_PATH)) {
        try {
          unlinkSync(QUEUE_OWNER_PATH);
        } catch (_err) {
          // Ignore errors removing stale marker
        }
      }
      return;
    }

    await sleep(50);
  }

  log.info('Queue released by previous owner');
}

export class AgentHl7DurableQueue {
  readonly log: ILogger;
  private db: DatabaseSync | undefined;
  private closed = false;

  // Prepared statements - initialized in init()
  private insertMessageStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getNextMessageStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getNextReceivedMessageStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getAllReceivedMessagesStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getNextResponseQueuedMessageStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getMessageByCallbackStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private getMessageByRemoteStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markSentStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markCommitAckedStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markAppAckedStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markErrorStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markTimedOutStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markResponseQueuedStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markResponseSentStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markResponseTimedOutStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private markResponseErrorStmt: ReturnType<DatabaseSync['prepare']> | undefined;
  private countByStatusStmt: ReturnType<DatabaseSync['prepare']> | undefined;

  constructor(log: ILogger) {
    this.log = log;
  }

  /**
   * Initialize the database connection and prepare statements.
   * This is separate from the constructor to allow for delayed initialization
   * during upgrades when we need to wait for the old agent to release the queue.
   */
  init(): void {
    if (this.db) {
      this.log.warn('Queue already initialized');
      return;
    }

    this.log.info('Initializing durable queue database...');

    this.db = new DatabaseSync(MESSAGE_DB_PATH);

    // Increase cache size for better read performance (negative value = KB)
    this.db.exec('PRAGMA cache_size=-64000;'); // 64MB cache

    // We need to always at least run this to make sure that the migrations table exists
    this.db.exec(`CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY)`);

    const statement = this.db.prepare(`SELECT id FROM migrations WHERE id = ? LIMIT 1;`);
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if ((statement.all(i) as { id: number }[])[0]?.id !== undefined) {
        continue;
      }
      for (const migration of MIGRATIONS[i]) {
        this.log.info('Running migration', { migrationGroup: i, statement: migration });
        this.db.exec(migration);
      }
    }

    // Prepare statements for better performance
    this.prepareStatements();

    // Claim ownership
    writeFileSync(QUEUE_OWNER_PATH, process.pid.toString());
    this.log.info(`Durable queue initialized, owner PID: ${process.pid}`);
  }

  private prepareStatements(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    this.insertMessageStmt = this.db.prepare(
      `INSERT INTO hl7_messages (received_time, raw_message, sender, receiver, message_ctrl_id, channel, remote, callback, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received')`
    );

    this.getNextMessageStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_ctrl_id, channel FROM hl7_messages
       WHERE channel = ? AND status IN ('received', 'timed_out')
       ORDER BY received_time ASC
       LIMIT 1`
    );

    this.getNextReceivedMessageStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_ctrl_id, channel, remote, callback FROM hl7_messages
       WHERE status = 'received'
       ORDER BY received_time ASC
       LIMIT 1`
    );

    this.getAllReceivedMessagesStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_ctrl_id, channel, remote, callback FROM hl7_messages
       WHERE status = 'received'
       ORDER BY received_time ASC
       LIMIT ?`
    );

    this.getNextResponseQueuedMessageStmt = this.db.prepare(
      `SELECT id, raw_message, response_message, channel, remote, callback FROM hl7_messages
       WHERE status = 'response_queued'
       ORDER BY response_queued_time ASC
       LIMIT 1`
    );

    this.getMessageByCallbackStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_ctrl_id, channel, remote, callback, status FROM hl7_messages
       WHERE callback = ?
       LIMIT 1`
    );

    this.getMessageByRemoteStmt = this.db.prepare(
      `SELECT id, raw_message, sender, receiver, message_ctrl_id, channel, remote, callback, status FROM hl7_messages
       WHERE remote = ?
       LIMIT 1`
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
   * Check if the queue is ready for use.
   * @returns True if the database is initialized and not closed.
   */
  isReady(): boolean {
    return this.db !== undefined && !this.closed;
  }

  /**
   * Close the database connection and release ownership.
   * Should be called during graceful shutdown, especially before upgrades.
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.log.info('Closing durable queue...');
    this.closed = true;

    // Close the database
    if (this.db) {
      try {
        this.db.close();
        this.db = undefined;
      } catch (err) {
        this.log.error(`Error closing database: ${(err as Error).message}`);
      }
    }

    // Release ownership marker
    if (existsSync(QUEUE_OWNER_PATH)) {
      try {
        unlinkSync(QUEUE_OWNER_PATH);
        this.log.info('Queue ownership released');
      } catch (err) {
        this.log.error(`Error removing queue owner file: ${(err as Error).message}`);
      }
    }
  }

  private assertReady(): void {
    if (!this.isReady()) {
      throw new Error('Durable queue not ready - call init() first');
    }
  }

  /**
   * Add a message to the queue with metadata from the MSH segment.
   * @param message - The HL7 message to add to the queue.
   * @param channel - The channel the message was received on.
   * @param remote - The remote address the message was received from.
   * @param callback - Optional callback ID for the message.
   * @returns The ID of the inserted message.
   */
  addMessage(message: Hl7Message, channel: string, remote: string, callback?: string): number {
    this.assertReady();
    const receivedTime = Date.now();
    const rawMessage = message.toString();
    const msh = message.getSegment('MSH');
    const sender = msh?.getField(3)?.toString() ?? '';
    const receiver = msh?.getField(5)?.toString() ?? '';
    const messageId = msh?.getField(10)?.toString() ?? '';

    const result = (this.insertMessageStmt as PreparedStatement).run(
      receivedTime,
      rawMessage,
      sender,
      receiver,
      messageId,
      channel,
      remote ?? null,
      callback ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get the next message to process for a channel.
   * Returns messages with status 'received' or 'timed_out', ordered by received time.
   * @param channel - The channel to get the next message for.
   * @returns The next message to process, or undefined if none available.
   */
  getNextMessage(channel: string): QueueMessage | undefined {
    this.assertReady();
    return (this.getNextMessageStmt as PreparedStatement).get(channel) as QueueMessage | undefined;
  }

  /**
   * Mark a message as sent.
   * @param messageId - The ID of the message to mark as sent.
   */
  markAsSent(messageId: number): void {
    this.assertReady();
    (this.markSentStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as commit_acked.
   * @param messageId - The ID of the message to mark as commit_acked.
   */
  markAsCommitAcked(messageId: number): void {
    this.assertReady();
    (this.markCommitAckedStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as app_acked.
   * @param messageId - The ID of the message to mark as app_acked.
   */
  markAsAppAcked(messageId: number): void {
    this.assertReady();
    (this.markAppAckedStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as error.
   * @param messageId - The ID of the message to mark as error.
   */
  markAsError(messageId: number): void {
    this.assertReady();
    (this.markErrorStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as timed_out.
   * @param messageId - The ID of the message to mark as timed_out.
   */
  markAsTimedOut(messageId: number): void {
    this.assertReady();
    (this.markTimedOutStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as response_queued and store the response.
   * @param messageId - The ID of the message to mark as response_queued.
   * @param responseMessage - The response message to store.
   */
  markAsResponseQueued(messageId: number, responseMessage: string): void {
    this.assertReady();
    (this.markResponseQueuedStmt as PreparedStatement).run(responseMessage, Date.now(), messageId);
  }

  /**
   * Mark a message as response_sent.
   * @param messageId - The ID of the message to mark as response_sent.
   */
  markAsResponseSent(messageId: number): void {
    this.assertReady();
    (this.markResponseSentStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as response_timed_out.
   * @param messageId - The ID of the message to mark as response_timed_out.
   */
  markAsResponseTimedOut(messageId: number): void {
    this.assertReady();
    (this.markResponseTimedOutStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Mark a message as response_error.
   * @param messageId - The ID of the message to mark as response_error.
   */
  markAsResponseError(messageId: number): void {
    this.assertReady();
    (this.markResponseErrorStmt as PreparedStatement).run(Date.now(), messageId);
  }

  /**
   * Get the next message with status 'received'.
   * @returns The next received message, or undefined if none available.
   */
  getNextReceivedMessage(): QueueMessageWithRemote | undefined {
    this.assertReady();
    return (this.getNextReceivedMessageStmt as PreparedStatement).get() as QueueMessageWithRemote | undefined;
  }

  /**
   * Get all messages with status 'received', up to a limit.
   * @param limit - Maximum number of messages to return (default 1000).
   * @returns Array of received messages.
   */
  getAllReceivedMessages(limit: number = 1000): QueueMessageWithRemote[] {
    this.assertReady();
    return (this.getAllReceivedMessagesStmt as PreparedStatement).all(limit) as unknown as QueueMessageWithRemote[];
  }

  /**
   * Get the next message with status 'response_queued'.
   * @returns The next response queued message, or undefined if none available.
   */
  getNextResponseQueuedMessage(): QueueResponseMessage | undefined {
    this.assertReady();
    return (this.getNextResponseQueuedMessageStmt as PreparedStatement).get() as QueueResponseMessage | undefined;
  }

  /**
   * Get a message by its callback ID.
   * @param callback - The callback ID to search for.
   * @returns The message, or undefined if not found.
   */
  getMessageByCallback(callback: string): QueueMessageWithStatus | undefined {
    this.assertReady();
    return (this.getMessageByCallbackStmt as PreparedStatement).get(callback) as QueueMessageWithStatus | undefined;
  }

  /**
   * Get a message by its remote identifier.
   * @param remote - The remote identifier to search for.
   * @returns The message, or undefined if not found.
   */
  getMessageByRemote(remote: string): QueueMessageWithStatus | undefined {
    this.assertReady();
    return (this.getMessageByRemoteStmt as PreparedStatement).get(remote) as QueueMessageWithStatus | undefined;
  }

  /**
   * Count messages by status.
   * @param status - The status to count.
   * @returns The count of messages with that status.
   */
  countByStatus(status: (typeof MESSAGE_STATUSES)[number]): number {
    this.assertReady();
    const result = (this.countByStatusStmt as PreparedStatement).get(status) as { count: number };
    return result?.count ?? 0;
  }
}
