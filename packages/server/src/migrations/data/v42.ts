// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'Coding_system_displayUnaccentTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coding_system_displayUnaccentTrgm_idx" ON "Coding" USING gin ("system", medplum_unaccent(display) gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Coding_display_idx"`);
  await normalizeDisplayToNfc(client, results);
}

/** Rows scanned per statement. Bounds how long any single row lock is held. */
const BACKFILL_BATCH_SIZE = 5000;

/**
 * Rewrites pre-existing `Coding.display` values to NFC, so that equal-looking strings are equal bytes.
 * Writes have normalized on the way in since this migration's release (see `codesystemimport.ts`); this
 * covers rows imported before that.
 *
 * Paginates by `id` rather than re-selecting non-NFC rows each pass: the qualifying predicate is not
 * indexable, so a re-selecting loop would rescan the whole table per batch.
 *
 * Rows whose normalized form would collide with an existing row on
 * `(system, code, display, COALESCE(synonymOf, -1))` are skipped rather than updated — collapsing both
 * forms into one string would violate that unique index and abort the batch. Those are true duplicates
 * that differ only by normalization form, and are left for separate cleanup; the count is reported.
 * @param client - The database client.
 * @param results - The list of action results to push operations performed.
 */
async function normalizeDisplayToNfc(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  const start = Date.now();
  const sql = `
    WITH batch AS (
      SELECT id, system, code, display, "synonymOf"
      FROM "Coding"
      WHERE id > $1
      ORDER BY id
      LIMIT $2
    ), candidates AS (
      -- DISTINCT ON collapses rows within the batch that would normalize to the same value, so a batch
      -- can never self-collide; the losers are counted as skipped and left in place.
      SELECT DISTINCT ON (b.system, b.code, normalize(b.display, NFC), COALESCE(b."synonymOf", -1))
        b.id, b.system, b.code, b."synonymOf", normalize(b.display, NFC) AS normalized
      FROM batch b
      WHERE b.display IS DISTINCT FROM normalize(b.display, NFC)
      ORDER BY b.system, b.code, normalize(b.display, NFC), COALESCE(b."synonymOf", -1), b.id
    ), updated AS (
      UPDATE "Coding" c
      SET display = n.normalized
      FROM candidates n
      WHERE c.id = n.id
        AND NOT EXISTS (
          SELECT 1 FROM "Coding" o
          WHERE o.system = n.system
            AND o.code = n.code
            AND o.display = n.normalized
            AND COALESCE(o."synonymOf", -1) = COALESCE(n."synonymOf", -1)
            AND o.id <> n.id
        )
      RETURNING c.id
    )
    SELECT
      max(b.id) AS "maxId",
      count(*)::int AS "scanned",
      count(*) FILTER (WHERE b.display IS DISTINCT FROM normalize(b.display, NFC))::int AS "nonNfc",
      (SELECT count(*)::int FROM updated) AS "updated"
    FROM batch b`;

  let lastId = '0';
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  for (;;) {
    const result = await client.query<{
      maxId: string | null;
      scanned: number;
      nonNfc: number;
      updated: number;
    }>(sql, [lastId, BACKFILL_BATCH_SIZE]);
    const row = result.rows[0];
    if (!row.scanned || !row.maxId) {
      break;
    }
    lastId = row.maxId;
    scanned += row.scanned;
    updated += row.updated;
    // Rows the batch identified as non-NFC but could not rewrite: either a normalization-form duplicate
    // already exists, or another row in the same batch normalized to the same value
    skipped += row.nonNfc - row.updated;
  }

  results.push({ name: 'Normalize Coding.display to NFC', durationMs: Date.now() - start, scanned, updated, skipped });
}
