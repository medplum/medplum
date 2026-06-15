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
        -- original_message is the message exactly as received, used for the
        -- intake duplicate-content comparison. finalized_message is what the
        -- worker dispatches upstream; it differs from original only when the
        -- channel rewrites the message (e.g. assignSeqNo sets MSH.13). When no
        -- transformation applies the two are byte-identical.
        original_message      BLOB    NOT NULL,
        finalized_message     BLOB    NOT NULL,
        encoding              TEXT,
        enhanced_mode         TEXT,
        -- state tracks the Bot leg (queued/processing/processed/rejected/failed)
        -- plus the intake-reject 'nacked'. The source-leg ACK-delivery outcome is
        -- tracked independently in ack_outcome
        -- (pending/delivered/undelivered/not_owed) so the two legs never conflate.
        state                 TEXT    NOT NULL,
        attempt_count         INTEGER NOT NULL DEFAULT 0,
        callback_id           TEXT    NOT NULL,
        server_response_body  BLOB,
        server_status_code    INTEGER,
        ack_outcome           TEXT    NOT NULL DEFAULT 'pending',
        last_error            TEXT,
        error_code            TEXT,
        seq_no                INTEGER,
        received_at           INTEGER NOT NULL,
        processing_started_at INTEGER,
        processed_at          INTEGER,
        errored_at            INTEGER
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_inbound_channel_state_id
        ON inbound_hl7_messages (channel_name, state, id);

      -- Also serves the retention phase-3 sweep: its (state IN ... OR ...)
      -- predicate resolves to a MULTI-INDEX OR over this index's leading state
      -- column, so the sweep filters by index rather than full-scanning. A
      -- dedicated COALESCE(errored_at, processed_at) expression index was
      -- evaluated to also satisfy phase 3's ORDER BY, but SQLite's partial-index
      -- prover can't match that disjunctive predicate (so a partial index goes
      -- unused), and a non-partial one would key every queued row as NULL and tax
      -- the hot intake path -- not worth it for an hourly, size-gated sweep.
      CREATE INDEX IF NOT EXISTS idx_inbound_state_processed_at
        ON inbound_hl7_messages (state, processed_at);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dup_active
        ON inbound_hl7_messages (channel_name, msg_control_id)
        WHERE msg_control_id IS NOT NULL
          AND state IN ('queued', 'processing');

      -- Intake dedup reads the most recent prior row for a (channel, control_id)
      -- across ALL non-nacked states (uq_inbound_dup_active only covers the
      -- active window). This runs once per inbound message that carries an
      -- MSH.10, so without it the lookup scans every row for the channel. The
      -- trailing id makes ORDER BY id DESC LIMIT 1 a reverse index seek; the
      -- partial predicate matches the query so there's no residual recheck.
      CREATE INDEX IF NOT EXISTS idx_inbound_dup_lookup
        ON inbound_hl7_messages (channel_name, msg_control_id, id)
        WHERE msg_control_id IS NOT NULL
          AND state != 'nacked';

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

      -- Per-channel monotonic sequence counter for the assignSeqNo feature.
      -- Persisting it here (rather than only in memory) keeps MSH.13 sequence
      -- numbers monotonic across agent restarts. last_seq_no holds the most
      -- recently assigned value; the next assignment is last_seq_no + 1.
      CREATE TABLE IF NOT EXISTS _channel_seq (
        channel_name TEXT    PRIMARY KEY,
        last_seq_no  INTEGER NOT NULL
      ) STRICT;
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
