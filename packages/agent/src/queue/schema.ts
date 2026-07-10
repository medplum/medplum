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
 * See DURABLE_QUEUE_ARCHITECTURE.md §3.2.
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
        -- state tracks the Bot leg: queued → claimed (worker owns it, request not
        -- yet on the wire) → inflight (request written to the socket, sent_at
        -- stamped, awaiting response) → processed/rejected/failed, plus the
        -- intake-reject 'nacked'. The claimed/inflight split is what lets crash
        -- recovery tell a provably-unsent row (safe to requeue) from an ambiguous
        -- in-flight one (must fail or, under guaranteed delivery, requeue). A
        -- retryable failure returns to 'queued' with next_attempt_at set (see
        -- §4.1). The source-leg ACK-delivery outcome is tracked independently in
        -- ack_outcome (pending/delivered/undelivered/not_owed) so the legs never conflate.
        state                 TEXT    NOT NULL,
        attempt_count         INTEGER NOT NULL DEFAULT 0,
        callback_id           TEXT    NOT NULL,
        server_response_body  BLOB,
        server_status_code    INTEGER,
        ack_outcome           TEXT    NOT NULL DEFAULT 'pending',
        last_error            TEXT,
        -- error_code is the machine-readable failure classification (QueueErrorCode);
        -- the retry policy gates on it, never on the free-form last_error string.
        error_code            TEXT,
        seq_no                INTEGER,
        received_at           INTEGER NOT NULL,
        -- processing_started_at is stamped when the worker claims the row (enters
        -- the claimed state); sent_at is stamped when the request is written to the
        -- socket (enters inflight). A NULL sent_at on a claimed row is the durable
        -- discriminator crash recovery uses to know the request never left.
        processing_started_at INTEGER,
        sent_at               INTEGER,
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
          AND state IN ('queued', 'claimed', 'inflight');

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
  {
    // Auto-retry support for the Bot leg. Adds two columns to the existing
    // inbound_hl7_messages table. SQLite ALTER TABLE ... ADD COLUMN is cheap
    // even on a populated DB *for these two columns*: it only rewrites the
    // schema text and leaves existing rows untouched. That's NOT universally
    // true -- adding a column with a CHECK constraint, or a generated column
    // with NOT NULL, forces a full-table read/rewrite proportional to row count.
    // Neither column here does that (next_attempt_at is nullable; the
    // guaranteed_delivery NOT NULL sits on a plain, non-generated column with a
    // DEFAULT), so both stay cheap. See
    // https://www.sqlite.org/lang_altertable.html#altertableaddcolumn.
    version: 2,
    sql: `
      -- next_attempt_at is the earliest time (ms) a retry-scheduled 'queued' row
      -- may be re-claimed; NULL unless an auto-retry backoff is pending. A
      -- retryable failure returns the row to 'queued' with this stamped (see §4.1).
      ALTER TABLE inbound_hl7_messages
        ADD COLUMN next_attempt_at INTEGER;

      -- guaranteed_delivery snapshots the channel's guaranteedDelivery setting at
      -- intake, so recoverOnStartup (which runs before channel policies resolve)
      -- knows whether to requeue (1) or fail (0) an interrupted inflight row.
      ALTER TABLE inbound_hl7_messages
        ADD COLUMN guaranteed_delivery INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    // Logical channels: partition a physical channel's rows into independent
    // FIFO sub-queues, so a bounded worker pool can process distinct partitions
    // concurrently while each partition stays strictly serial. The partition of
    // a row is its logical_channel_key, computed at intake from the channel's
    // `logicalChannelKey` spec (a set of HL7 field paths). The default '' means
    // "one queue for the whole channel" -- byte-identical to pre-logical-channel
    // behavior. See logical-channel.ts and the CLAIM_NEXT partition logic.
    //
    // ADD COLUMN stays cheap here (a plain, non-generated TEXT with a literal
    // DEFAULT rewrites only the schema text, not existing rows -- same rationale
    // as the v2 columns). The companion index is what the partition-aware claim
    // relies on to stay off a full table scan.
    version: 3,
    sql: `
      ALTER TABLE inbound_hl7_messages
        ADD COLUMN logical_channel_key TEXT NOT NULL DEFAULT '';

      -- Serves the partition-aware CLAIM_NEXT: the per-partition head lookup
      -- (MIN(id) WHERE channel+vkey+state='queued') and the "is this partition
      -- already being processed" busy check (channel+vkey+state IN claimed,inflight).
      -- Leading (channel_name, logical_channel_key, state) lets both resolve by
      -- index seek; the trailing id makes the MIN a boundary read.
      CREATE INDEX IF NOT EXISTS idx_inbound_vchannel_claim
        ON inbound_hl7_messages (channel_name, logical_channel_key, state, id);
    `,
  },
  {
    // Claim-time partitioning + the new `delayed` state (a row parked behind an
    // earlier not-yet-settled message in the same logical channel). A `delayed`
    // row is still an ACTIVE occupant of its (channel_name, msg_control_id): an
    // inbound retransmit while it waits must dedupe against it, not insert a
    // second copy. So the active-duplicate unique index has to include `delayed`
    // in its state predicate; recreate the partial UNIQUE index to widen it.
    //
    // Safe on the populated table: this migration is the first to introduce the
    // `delayed` state, so zero rows are in it at apply time and the widened
    // predicate cannot surface a new uniqueness violation. The DROP + CREATE runs
    // inside this migration's transaction (see runMigrations), so it's atomic.
    // The other dup index (idx_inbound_dup_lookup, WHERE state != 'nacked') and
    // the claim index (idx_inbound_vchannel_claim, keyed on state) already cover
    // `delayed` without change.
    version: 4,
    sql: `
      DROP INDEX IF EXISTS uq_inbound_dup_active;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dup_active
        ON inbound_hl7_messages (channel_name, msg_control_id)
        WHERE msg_control_id IS NOT NULL
          AND state IN ('queued', 'delayed', 'claimed', 'inflight');
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
