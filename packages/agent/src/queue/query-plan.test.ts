// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createMockLogger } from '../test-utils';
import { DurableQueue } from './durable-queue';
import {
  CLAIM_NEXT,
  FIND_BY_CALLBACK,
  FIND_SEEN_BY_CONTROL_ID,
  LIST_QUEUED_IDS_FOR_CHANNEL,
  RECOVER_PROCESSING,
  RECOVER_PROCESSING_GUARANTEED,
  RETENTION_PHASE1_DELETE,
  RETENTION_PHASE2_DELETE,
  RETENTION_PHASE3_DELETE,
} from './queries';

/**
 * Index regression guards. For each query whose performance depends on an index,
 * we ask SQLite's planner (`EXPLAIN QUERY PLAN`) what it would do and assert it
 * (a) uses the expected index and (b) never falls back to a full table scan of
 * `inbound_hl7_messages`. The SQL comes from the same constants the production
 * prepared statements use (`./queries`), so if a query is reshaped in a way that
 * drops its index, this test fails — there is no way for the two to drift apart.
 */

/** Each query under guard: the exact SQL, dummy params (values don't affect the plan), and the index it must use. */
const CASES: { name: string; sql: string; params: unknown[]; index: string }[] = [
  // Hot path
  { name: 'findSeenByControlId', sql: FIND_SEEN_BY_CONTROL_ID, params: ['ch', 'mc'], index: 'idx_inbound_dup_lookup' },
  { name: 'claimNext', sql: CLAIM_NEXT, params: [0, 'ch', 0], index: 'idx_inbound_channel_state_id' },
  { name: 'findByCallback', sql: FIND_BY_CALLBACK, params: ['cb'], index: 'uq_inbound_callback' },
  // Startup / recovery
  {
    name: 'listQueuedIdsForChannel',
    sql: LIST_QUEUED_IDS_FOR_CHANNEL,
    params: ['ch'],
    index: 'idx_inbound_channel_state_id',
  },
  { name: 'recoverProcessing', sql: RECOVER_PROCESSING, params: [0], index: 'idx_inbound_state_processed_at' },
  {
    name: 'recoverProcessingGuaranteed',
    sql: RECOVER_PROCESSING_GUARANTEED,
    params: [],
    index: 'idx_inbound_state_processed_at',
  },
  // Retention sweep
  { name: 'retentionPhase1', sql: RETENTION_PHASE1_DELETE, params: [0], index: 'idx_inbound_state_processed_at' },
  { name: 'retentionPhase2', sql: RETENTION_PHASE2_DELETE, params: [0], index: 'idx_inbound_state_processed_at' },
  // Phase 3's disjunctive predicate resolves to a MULTI-INDEX OR over the leading
  // `state` column of idx_inbound_state_processed_at — enough to avoid a full scan.
  // (A dedicated COALESCE() expression index can't be used here; see schema.ts.)
  { name: 'retentionPhase3', sql: RETENTION_PHASE3_DELETE, params: [0, 0], index: 'idx_inbound_state_processed_at' },
];

// Returns the `detail` line of every step in the query plan for `sql`.
// EXPLAIN QUERY PLAN does not run the query, so param values are irrelevant — but
// node:sqlite still wants one bound value per '?', so we pass dummies.
function planDetails(db: DatabaseSync, sql: string, params: unknown[]): string[] {
  const rows = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...(params as never[]));
  return rows.map((r) => String((r as { detail: unknown }).detail));
}

// A bare "SCAN inbound_hl7_messages" (with no "USING ... INDEX") is a full table
// scan. "SEARCH ... USING INDEX" (seek) and "SCAN ... USING [COVERING] INDEX"
// (ordered index scan) both ride an index and are fine.
function isFullTableScan(detail: string): boolean {
  return detail.includes('SCAN ') && detail.includes('inbound_hl7_messages') && !detail.includes('USING');
}

describe('hot-path query plans', () => {
  let dir: string;
  let queue: DurableQueue;
  let db: DatabaseSync;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dq-plan-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
    db = queue.getDb();
  });

  afterAll(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test.each(CASES)('$name uses $index', ({ sql, params, index }) => {
    const details = planDetails(db, sql, params);
    expect(details.join('\n')).toContain(index);
  });

  test.each(CASES)('$name never full-scans inbound_hl7_messages', ({ sql, params }) => {
    const details = planDetails(db, sql, params);
    // Surfaces the offending plan line(s) in the failure output if any slip through.
    expect(details.filter(isFullTableScan)).toEqual([]);
  });
});
