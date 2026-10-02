// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { escapeIdentifier } from 'pg';
import { loadTestConfig } from '../../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../../database';
import type { MigrationActionResult } from '../types';
import { backfillDeleteHistoryTombstonesForResourceType } from './backfill-delete-history-tombstones';

const resourceType = 'DeleteTombstoneBackfillTest';
const historyTable = `${resourceType}_History`;

describe('backfill delete history tombstones', () => {
  let client: Pool;

  beforeAll(async () => {
    await initDatabase(await loadTestConfig());
    client = getDatabasePool(DatabaseMode.WRITER);
  });

  afterAll(async () => {
    await client.query(`DROP TABLE IF EXISTS ${escapeIdentifier(historyTable)}`);
    await client.query(`DROP TABLE IF EXISTS ${escapeIdentifier(resourceType)}`);
    await closeDatabase();
  });

  beforeEach(async () => {
    await client.query(`DROP TABLE IF EXISTS ${escapeIdentifier(historyTable)}`);
    await client.query(`DROP TABLE IF EXISTS ${escapeIdentifier(resourceType)}`);
    await client.query(`
      CREATE TABLE ${escapeIdentifier(resourceType)} (
        id UUID PRIMARY KEY,
        "lastUpdated" TIMESTAMPTZ NOT NULL,
        deleted BOOLEAN NOT NULL,
        "projectId" UUID
      )
    `);
    await client.query(`
      CREATE TABLE ${escapeIdentifier(historyTable)} (
        "versionId" UUID PRIMARY KEY,
        id UUID NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      )
    `);
  });

  async function runBackfill(): Promise<void> {
    const results: MigrationActionResult[] = [];
    await backfillDeleteHistoryTombstonesForResourceType(client, results, resourceType);
  }

  test('backfills empty delete history content with tombstone metadata', async () => {
    // begin
    const id = randomUUID();
    const priorVersionId = randomUUID();
    const deleteVersionId = randomUUID();
    const projectId = randomUUID();
    const priorLastUpdated = new Date('2025-01-01T00:00:00.000Z');
    const deleteLastUpdated = new Date('2025-06-01T12:00:00.000Z');

    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [
        priorVersionId,
        id,
        JSON.stringify({
          resourceType,
          id,
          meta: { versionId: priorVersionId, project: projectId },
        }),
        priorLastUpdated,
      ]
    );
    await client.query(
      `INSERT INTO ${escapeIdentifier(resourceType)} (id, "lastUpdated", deleted, "projectId") VALUES ($1, $2, $3, $4)`,
      [id, deleteLastUpdated, true, projectId]
    );
    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [deleteVersionId, id, '', deleteLastUpdated]
    );

    // when
    await runBackfill();

    // then
    const result = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [deleteVersionId]
    );
    expect(result.rows).toHaveLength(1);
    const tombstone = JSON.parse(result.rows[0].content);
    expect(tombstone).toMatchObject({
      resourceType,
      id,
      meta: {
        versionId: deleteVersionId,
        lastUpdated: deleteLastUpdated.toISOString(),
        deleted: true,
        project: projectId,
      },
    });
  });

  test('backfills lastUpdated using ISO-8601 millisecond format', async () => {
    // begin
    const id = randomUUID();
    const deleteVersionId = randomUUID();
    const deleteLastUpdated = new Date('2025-06-01T12:34:56.789Z');

    await client.query(
      `INSERT INTO ${escapeIdentifier(resourceType)} (id, "lastUpdated", deleted, "projectId") VALUES ($1, $2, $3, $4)`,
      [id, deleteLastUpdated, true, randomUUID()]
    );
    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [deleteVersionId, id, '', deleteLastUpdated]
    );

    // when
    await runBackfill();

    // then
    const result = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [deleteVersionId]
    );
    const tombstone = JSON.parse(result.rows[0].content);
    expect(tombstone.meta.lastUpdated).toBe(deleteLastUpdated.toISOString());
  });

  test('backfills empty history rows without a main resource row', async () => {
    // begin
    const id = randomUUID();
    const versionId = randomUUID();
    const lastUpdated = new Date('2025-06-01T12:00:00.000Z');

    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [versionId, id, '', lastUpdated]
    );

    // when
    await runBackfill();

    // then
    const result = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [versionId]
    );
    const tombstone = JSON.parse(result.rows[0].content);
    expect(tombstone).toMatchObject({
      resourceType,
      id,
      meta: {
        versionId,
        lastUpdated: lastUpdated.toISOString(),
        deleted: true,
      },
    });
  });

  test('backfills empty history rows even when main resource is not deleted', async () => {
    // begin
    const id = randomUUID();
    const versionId = randomUUID();
    const lastUpdated = new Date('2025-06-01T12:00:00.000Z');

    await client.query(
      `INSERT INTO ${escapeIdentifier(resourceType)} (id, "lastUpdated", deleted, "projectId") VALUES ($1, $2, $3, $4)`,
      [id, lastUpdated, false, randomUUID()]
    );
    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [versionId, id, '', lastUpdated]
    );

    // when
    await runBackfill();

    // then
    const result = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [versionId]
    );
    const tombstone = JSON.parse(result.rows[0].content);
    expect(tombstone).toMatchObject({
      resourceType,
      id,
      meta: {
        versionId,
        lastUpdated: lastUpdated.toISOString(),
        deleted: true,
      },
    });
  });

  test('is idempotent', async () => {
    // begin
    const id = randomUUID();
    const deleteVersionId = randomUUID();
    const deleteLastUpdated = new Date('2025-06-01T12:00:00.000Z');

    await client.query(
      `INSERT INTO ${escapeIdentifier(resourceType)} (id, "lastUpdated", deleted, "projectId") VALUES ($1, $2, $3, $4)`,
      [id, deleteLastUpdated, true, randomUUID()]
    );
    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [deleteVersionId, id, '', deleteLastUpdated]
    );

    // when
    await runBackfill();
    const afterFirst = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [deleteVersionId]
    );

    await runBackfill();

    // then
    const afterSecond = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [deleteVersionId]
    );

    expect(afterSecond.rows[0].content).toBe(afterFirst.rows[0].content);
  });

  test('picks the highest versionId when prior rows share lastUpdated', async () => {
    // begin
    const id = randomUUID();
    const earlierVersionId = '00000000-0000-4000-8000-000000000001';
    const laterVersionId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const deleteVersionId = randomUUID();
    const tiedLastUpdated = new Date('2025-01-01T00:00:00.000Z');
    const deleteLastUpdated = new Date('2025-06-01T12:00:00.000Z');
    const earlierProjectId = randomUUID();
    const laterProjectId = randomUUID();

    for (const [versionId, projectId] of [
      [earlierVersionId, earlierProjectId],
      [laterVersionId, laterProjectId],
    ] as const) {
      await client.query(
        `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [
          versionId,
          id,
          JSON.stringify({
            resourceType,
            id,
            meta: { versionId, project: projectId },
          }),
          tiedLastUpdated,
        ]
      );
    }
    await client.query(
      `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [deleteVersionId, id, '', deleteLastUpdated]
    );

    // when
    const results: MigrationActionResult[] = [];
    await backfillDeleteHistoryTombstonesForResourceType(client, results, resourceType, 1);

    // then
    expect(results[0]?.iterations).toBe(1);
    const result = await client.query<{ content: string }>(
      `SELECT content FROM ${escapeIdentifier(historyTable)} WHERE "versionId" = $1`,
      [deleteVersionId]
    );
    const tombstone = JSON.parse(result.rows[0].content);
    expect(tombstone.meta.project).toBe(laterProjectId);
  });

  test('processes rows in batches until complete', async () => {
    // begin
    const deleteLastUpdated = new Date('2025-06-01T12:00:00.000Z');
    const rows = [
      { id: randomUUID(), versionId: randomUUID() },
      { id: randomUUID(), versionId: randomUUID() },
    ];

    for (const row of rows) {
      await client.query(
        `INSERT INTO ${escapeIdentifier(resourceType)} (id, "lastUpdated", deleted, "projectId") VALUES ($1, $2, $3, $4)`,
        [row.id, deleteLastUpdated, true, randomUUID()]
      );
      await client.query(
        `INSERT INTO ${escapeIdentifier(historyTable)} ("versionId", id, content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [row.versionId, row.id, '', deleteLastUpdated]
      );
    }

    // when
    const results: MigrationActionResult[] = [];
    await backfillDeleteHistoryTombstonesForResourceType(client, results, resourceType, 1);

    // then
    expect(results[0]?.iterations).toBe(2);

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${escapeIdentifier(historyTable)} WHERE content <> ''`
    );
    expect(Number(result.rows[0].count)).toBe(2);
  });
});
