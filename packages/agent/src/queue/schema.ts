// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSync } from 'node:sqlite';

/**
 * Versioned, forward-only schema migrations for the durable inbound queue DB.
 *
 * Each migration's `sql` is applied in a single transaction together with the
 * `_schema` row that records its version. Once shipped, a migration is never
 * edited in place — append a new version instead.
 *
 * See DURABLE_QUEUE_PLAN.md §3.2.
 */
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS _schema (
        version    INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inbound_hl7_messages (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_name          TEXT    NOT NULL,
        remote                TEXT    NOT NULL,
        msg_control_id        TEXT,
        msg_type              TEXT,
        body                  BLOB    NOT NULL,
        encoding              TEXT,
        enhanced_mode         TEXT,
        state                 TEXT    NOT NULL,
        attempt_count         INTEGER NOT NULL DEFAULT 0,
        callback_id           TEXT    NOT NULL,
        server_response_body  BLOB,
        server_status_code    INTEGER,
        ack_sent_to_source    INTEGER NOT NULL DEFAULT 0,
        last_error            TEXT,
        seq_no                INTEGER,
        received_at           INTEGER NOT NULL,
        committed_at          INTEGER,
        processing_started_at INTEGER,
        processed_at          INTEGER,
        errored_at            INTEGER
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_inbound_channel_state_id
        ON inbound_hl7_messages (channel_name, state, id);

      CREATE INDEX IF NOT EXISTS idx_inbound_state_processed_at
        ON inbound_hl7_messages (state, processed_at);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dup_active
        ON inbound_hl7_messages (channel_name, msg_control_id)
        WHERE msg_control_id IS NOT NULL
          AND state IN ('queued', 'processing');

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_callback
        ON inbound_hl7_messages (callback_id);

      -- Single-row table holding the current queue lease, used for coordinating
      -- the active queue worker across zero-downtime agent upgrades (two
      -- processes share the DB for the upgrade overlap window; only the
      -- leaseholder drains rows and runs recovery). The CHECK constraint keeps
      -- it strictly single-row.
      CREATE TABLE IF NOT EXISTS _lease (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        holder      TEXT    NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    sql: `
      -- Auto-retry support: machine-readable failure classification plus the
      -- earliest timestamp at which a retry-scheduled 'queued' row may be
      -- claimed again. Both NULL for rows that have never failed.
      ALTER TABLE inbound_hl7_messages ADD COLUMN error_code TEXT;
      ALTER TABLE inbound_hl7_messages ADD COLUMN next_attempt_at INTEGER;
    `,
  },
  {
    version: 3,
    sql: `
      -- Guaranteed-delivery support: snapshot of the channel's guaranteedDelivery
      -- setting at intake time. Rows with 1 are requeued (not errored) when found
      -- in 'processing' at startup, so the delivery guarantee survives restarts.
      ALTER TABLE inbound_hl7_messages ADD COLUMN guaranteed_delivery INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

/**
 * Applies any pending migrations to `db`. Idempotent — safe to call on every open.
 *
 * Each migration is executed inside its own transaction so a partial failure
 * cannot leave the schema between versions.
 *
 * @param db - The SQLite database handle to migrate.
 * @returns The schema version after migration (i.e. the highest applied version).
 */
export function runMigrations(db: DatabaseSync): number {
  // Bootstrap _schema first so we can read MAX(version). The first migration's SQL
  // is idempotent w.r.t. _schema creation thanks to IF NOT EXISTS.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const currentRow = db.prepare('SELECT MAX(version) AS v FROM _schema').get() as { v: number | null } | undefined;
  let current = currentRow?.v ?? 0;

  const insertVersion = db.prepare('INSERT INTO _schema (version, applied_at) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insertVersion.run(migration.version, Date.now());
      db.exec('COMMIT');
      current = migration.version;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return current;
}
