// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient, QueryResultRow } from 'pg';
import { PostgresError } from '../../fhir/sql';
import { globalLogger } from '../../logger';

const maxBatchAttempts = 2;

/**
 * Runs one batch statement in its own READ COMMITTED transaction, retrying on a serialization failure.
 *
 * Pool connections default to REPEATABLE READ, where a concurrent write to a row the batch touches fails the whole
 * statement; READ COMMITTED skips rows a concurrent transaction deleted and re-evaluates ones it updated.
 * @param client - The database client.
 * @param sql - The batch statement, returning a single summary row.
 * @param params - The batch statement parameters.
 * @returns The batch statement's summary row.
 */
export async function runReadCommittedBatch<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[]
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxBatchAttempts; attempt++) {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try {
      const result = await client.query<T>(sql, params);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code !== PostgresError.SerializationFailure) {
        throw err;
      }
      lastError = err;
      if (attempt < maxBatchAttempts) {
        globalLogger.warn('Retrying migration batch after serialization failure', { params, error: err.message });
      }
    }
  }
  throw lastError;
}
