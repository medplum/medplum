// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, normalizeErrorString, sleep, validateResourceType } from '@medplum/core';
import type { AsyncJob, Parameters, ParametersParameter, ResourceType } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { ArrayColumnPaddingConfig } from '../config/types';
import { DatabaseMode, getDatabasePool } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { SystemRepository } from '../fhir/repo';
import { getAllPaddingSentinels, getPaddingFraction } from '../fhir/token-column';
import { globalLogger } from '../logger';
import type { PostDeployJobData } from '../migrations/data/types';
import { isJobActive, updateAsyncJobOutput } from './utils';

export interface RepaddingUnit {
  readonly resourceType: ResourceType;
  readonly columnName: string;
}

export type RepaddingResult =
  | { swapped: number; removed: number; added: number; durationMs: number }
  | { swapped: number; removed: number; added: number; phase: string };

export interface RepaddingJobData extends PostDeployJobData {
  readonly type: 'repadding';
  readonly units: RepaddingUnit[];
  readonly oldConfig: ArrayColumnPaddingConfig;
  readonly newConfig: ArrayColumnPaddingConfig;
  currentUnitIndex: number;
  currentPhase: 'classify' | 'swap' | 'remove' | 'add' | 'cleanup';
  readonly startTime: number;
  count: number;
  readonly results: Record<string, RepaddingResult>;
  // Settings
  readonly batchSize?: number;
  readonly delayBetweenBatches?: number;
  readonly classifyStatementTimeout?: number;
  readonly batchStatementTimeout?: number;
}

interface RepaddingJobSettings {
  readonly batchSize: number;
  readonly delayBetweenBatches: number;
  readonly classifyStatementTimeout: number;
  readonly batchStatementTimeout: number;
}

const defaultSettings: RepaddingJobSettings = {
  batchSize: 5000,
  delayBetweenBatches: 0,
  classifyStatementTimeout: 0, // no limit for classify phase
  batchStatementTimeout: 300_000, // 5 min for batch phases
};

// Pattern for valid column names (code-controlled, always __[a-zA-Z]+)
const COLUMN_NAME_PATTERN = /^__[a-zA-Z]+$/;

export class RepaddingJob {
  private readonly systemRepo: SystemRepository;
  private settings: RepaddingJobSettings;

  constructor(systemRepo: SystemRepository) {
    this.systemRepo = systemRepo;
    this.settings = { ...defaultSettings };
  }

  private initSettings(data: RepaddingJobData): void {
    this.settings = {
      batchSize: data.batchSize ?? defaultSettings.batchSize,
      delayBetweenBatches: data.delayBetweenBatches ?? defaultSettings.delayBetweenBatches,
      classifyStatementTimeout: data.classifyStatementTimeout ?? defaultSettings.classifyStatementTimeout,
      batchStatementTimeout: data.batchStatementTimeout ?? defaultSettings.batchStatementTimeout,
    };
  }

  async execute(job: Job<RepaddingJobData> | undefined, data: RepaddingJobData): Promise<'finished' | 'interrupted'> {
    this.initSettings(data);
    const asyncJob = await this.systemRepo.readResource<AsyncJob>('AsyncJob', data.asyncJobId);

    if (!isJobActive(asyncJob)) {
      return 'interrupted';
    }

    return this.executeMainLoop(job, asyncJob, data);
  }

  private async executeMainLoop(
    job: Job<RepaddingJobData> | undefined,
    asyncJob: WithId<AsyncJob>,
    data: RepaddingJobData
  ): Promise<'finished' | 'interrupted'> {
    const pool = getDatabasePool(DatabaseMode.WRITER);

    while (data.currentUnitIndex < data.units.length) {
      const unit = data.units[data.currentUnitIndex];
      const unitKey = `${unit.resourceType}/${unit.columnName}`;

      // Validate resource type and column name for SQL safety
      validateResourceType(unit.resourceType);
      if (!COLUMN_NAME_PATTERN.test(unit.columnName)) {
        throw new Error(`Invalid column name: ${unit.columnName}`);
      }

      const unitStartTime = Date.now();
      const existingResult = data.results[unitKey] as RepaddingResult | undefined;
      let swapped = existingResult ? existingResult.swapped : 0;
      let removed = existingResult ? existingResult.removed : 0;
      let added = existingResult ? existingResult.added : 0;

      const phases: ('classify' | 'swap' | 'remove' | 'add' | 'cleanup')[] = [
        'classify',
        'swap',
        'remove',
        'add',
        'cleanup',
      ];
      const startPhaseIndex = phases.indexOf(data.currentPhase);

      for (let pi = startPhaseIndex; pi < phases.length; pi++) {
        const phase = phases[pi];
        data.currentPhase = phase;

        // Check if job is still active
        const refreshedJob = await this.systemRepo.readResource<AsyncJob>('AsyncJob', data.asyncJobId);
        if (!isJobActive(refreshedJob)) {
          return 'interrupted';
        }

        switch (phase) {
          case 'classify':
            await this.classifyUnit(pool, data, unit);
            break;
          case 'swap': {
            const count = await this.processBatchLoop(pool, data, unit, 'swap');
            swapped += count;
            break;
          }
          case 'remove': {
            const count = await this.processBatchLoop(pool, data, unit, 'remove');
            removed += count;
            break;
          }
          case 'add': {
            const count = await this.processBatchLoop(pool, data, unit, 'add');
            added += count;
            break;
          }
          case 'cleanup':
            await this.cleanupUnit(pool, data);
            break;
        }
      }

      const durationMs = Date.now() - unitStartTime;
      data.results[unitKey] = { swapped, removed, added, durationMs };

      globalLogger.info('Repadding completed for unit', {
        resourceType: unit.resourceType,
        columnName: unit.columnName,
        swapped,
        removed,
        added,
        durationMs,
      });

      // Update AsyncJob output
      const output = this.getAsyncJobOutput(data);
      await this.updateAsyncJobOutput(asyncJob, output);

      // Move to next unit
      data.currentUnitIndex++;
      data.currentPhase = 'classify';
      data.count = 0;
    }

    // Complete the job
    const exec = new AsyncJobExecutor(this.systemRepo, asyncJob);
    await exec.completeJob(this.getAsyncJobOutput(data));
    return 'finished';
  }

  private async classifyUnit(pool: Pool, data: RepaddingJobData, unit: RepaddingUnit): Promise<void> {
    const workTable = this.getWorkTableName(data);
    const oldSentinels = getAllPaddingSentinels(data.oldConfig.m);
    const newSentinels = getAllPaddingSentinels(data.newConfig.m);
    const oldFrac = getPaddingFraction(data.oldConfig);
    const newFrac = getPaddingFraction(data.newConfig);

    // Drop existing work table if any (idempotent for restarts)
    await pool.query(`DROP TABLE IF EXISTS "${workTable}"`);

    if (data.oldConfig.m === 0 && data.newConfig.m === 0) {
      // No-op: create empty work table
      await pool.query(`CREATE TABLE "${workTable}" (id UUID, action TEXT)`);
      return;
    }

    // Set statement timeout for classify phase
    const client = await pool.connect();
    try {
      if (this.settings.classifyStatementTimeout > 0) {
        await client.query(`SET statement_timeout = ${this.settings.classifyStatementTimeout}`);
      }

      if (newFrac <= oldFrac && data.oldConfig.m > 0) {
        // Optimization: only need rows with old sentinels (GIN-indexed)
        const swapProbability = oldFrac > 0 ? Math.min(1.0, newFrac / oldFrac) : 0;
        await client.query(
          `CREATE TABLE "${workTable}" AS
           SELECT id::UUID,
             CASE WHEN random() < $1
               THEN 'swap'::TEXT ELSE 'remove'::TEXT END AS action
           FROM "${unit.resourceType}"
           WHERE "${unit.columnName}" && $2::UUID[]`,
          [swapProbability, oldSentinels]
        );
      } else {
        // Full table scan needed for potential adds
        const swapProbability = oldFrac > 0 ? Math.min(1.0, newFrac / oldFrac) : 0;
        const addProbability = oldFrac >= 1.0 ? 0 : (newFrac - oldFrac) / (1.0 - oldFrac);

        await client.query(
          `CREATE TABLE "${workTable}" AS
           SELECT id::UUID, action::TEXT FROM (
             SELECT id,
               CASE
                 WHEN "${unit.columnName}" && $1::UUID[]
                   AND random() < $2
                   THEN 'swap'
                 WHEN "${unit.columnName}" && $1::UUID[]
                   THEN 'remove'
                 WHEN $5 > $6
                   AND NOT("${unit.columnName}" && $1::UUID[])
                   AND NOT("${unit.columnName}" && $3::UUID[])
                   AND random() < $4
                   THEN 'add'
                 ELSE NULL
               END AS action
             FROM "${unit.resourceType}"
           ) classified
           WHERE action IS NOT NULL`,
          [oldSentinels, swapProbability, newSentinels, addProbability, newFrac, oldFrac]
        );
      }
    } finally {
      if (this.settings.classifyStatementTimeout > 0) {
        await client.query('RESET statement_timeout');
      }
      client.release();
    }

    // Create index on work table for efficient batch processing
    await pool.query(`CREATE INDEX ON "${workTable}" (action)`);
  }

  private async processBatchLoop(
    pool: Pool,
    data: RepaddingJobData,
    unit: RepaddingUnit,
    action: 'swap' | 'remove' | 'add'
  ): Promise<number> {
    const workTable = this.getWorkTableName(data);
    const oldSentinels = getAllPaddingSentinels(data.oldConfig.m);
    const newSentinels = getAllPaddingSentinels(data.newConfig.m);
    const newM = data.newConfig.m;
    let totalProcessed = 0;

    while (true) {
      const client = await pool.connect();
      let rowsAffected = 0;
      try {
        if (this.settings.batchStatementTimeout > 0) {
          await client.query(`SET statement_timeout = ${this.settings.batchStatementTimeout}`);
        }

        switch (action) {
          case 'swap': {
            const result = await client.query(
              `WITH batch AS (
                DELETE FROM "${workTable}"
                WHERE id IN (SELECT id FROM "${workTable}" WHERE action = 'swap' LIMIT $1)
                RETURNING id
              )
              UPDATE "${unit.resourceType}" t
              SET "${unit.columnName}" = (
                SELECT array_agg(
                  CASE WHEN elem = ANY($2::UUID[])
                       THEN ($3::UUID[])[1 + floor(random() * $4)::int]
                       ELSE elem
                  END
                ) FROM unnest(t."${unit.columnName}") AS elem
              )
              FROM batch WHERE t.id = batch.id`,
              [this.settings.batchSize, oldSentinels, newSentinels, newM]
            );
            rowsAffected = result.rowCount ?? 0;
            break;
          }
          case 'remove': {
            const result = await client.query(
              `WITH batch AS (
                DELETE FROM "${workTable}"
                WHERE id IN (SELECT id FROM "${workTable}" WHERE action = 'remove' LIMIT $1)
                RETURNING id
              )
              UPDATE "${unit.resourceType}" t
              SET "${unit.columnName}" = (
                SELECT COALESCE(array_agg(elem), ARRAY[]::UUID[])
                FROM unnest(t."${unit.columnName}") AS elem
                WHERE elem != ALL($2::UUID[])
              )
              FROM batch WHERE t.id = batch.id`,
              [this.settings.batchSize, oldSentinels]
            );
            rowsAffected = result.rowCount ?? 0;
            break;
          }
          case 'add': {
            const result = await client.query(
              `WITH batch AS (
                DELETE FROM "${workTable}"
                WHERE id IN (SELECT id FROM "${workTable}" WHERE action = 'add' LIMIT $1)
                RETURNING id
              )
              UPDATE "${unit.resourceType}" t
              SET "${unit.columnName}" = t."${unit.columnName}" || ARRAY[
                ($2::UUID[])[1 + floor(random() * $3)::int]
              ]
              FROM batch WHERE t.id = batch.id`,
              [this.settings.batchSize, newSentinels, newM]
            );
            rowsAffected = result.rowCount ?? 0;
            break;
          }
        }
      } finally {
        if (this.settings.batchStatementTimeout > 0) {
          await client.query('RESET statement_timeout');
        }
        client.release();
      }

      totalProcessed += rowsAffected;

      if (rowsAffected === 0) {
        break;
      }

      if (this.settings.delayBetweenBatches > 0) {
        await sleep(this.settings.delayBetweenBatches);
      }
    }

    return totalProcessed;
  }

  private async cleanupUnit(pool: Pool, data: RepaddingJobData): Promise<void> {
    const workTable = this.getWorkTableName(data);
    await pool.query(`DROP TABLE IF EXISTS "${workTable}"`);
  }

  getWorkTableName(data: RepaddingJobData): string {
    const sanitizedId = data.asyncJobId.replace(/-/g, '');
    return `_repad_work_${sanitizedId}`;
  }

  private getAsyncJobOutput(data: RepaddingJobData): Parameters {
    const parameters: ParametersParameter[] = [];

    for (const [unitKey, result] of Object.entries(data.results)) {
      const parts: ParametersParameter[] = [
        { name: 'unit', valueString: unitKey },
        { name: 'swapped', valueInteger: result.swapped },
        { name: 'removed', valueInteger: result.removed },
        { name: 'added', valueInteger: result.added },
      ];

      if ('durationMs' in result) {
        parts.push({ name: 'elapsedTime', valueQuantity: { value: result.durationMs, code: 'ms' } });
      } else {
        parts.push({ name: 'phase', valueString: result.phase });
      }

      parameters.push({ name: 'result', part: parts });
    }

    return {
      resourceType: 'Parameters',
      parameter: parameters,
    };
  }

  private async updateAsyncJobOutput(asyncJob: WithId<AsyncJob>, output: Parameters): Promise<void> {
    try {
      await updateAsyncJobOutput(this.systemRepo, asyncJob, output);
    } catch (err) {
      globalLogger.warn('Failed to update AsyncJob output during repadding', {
        asyncJob: getReferenceString(asyncJob),
        error: normalizeErrorString(err),
      });
    }
  }
}
