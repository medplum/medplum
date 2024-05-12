import { normalizeErrorString } from '@medplum/core';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PoolClient } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { globalLogger } from '../logger';
import * as migrations from './schema/index';

export async function migrate(client: PoolClient, forceAllSteps = false): Promise<void> {
  let version: number;
  try {
    const result = await client.query<{ id: number; version: number; dataVersion: number }>(
      'SELECT "version" FROM "DatabaseMigration"'
    );
    version = result.rows[0]?.version ?? 0; // First version starts at v1
    globalLogger.info(`Current schema version: v${version}`);
  } catch (err) {
    globalLogger.debug(`Error during version query: ${normalizeErrorString(err)}`);
    globalLogger.info('Database not initialized. Initializing...');
    version = 0;
  }

  const prefixedVersions = Object.keys(migrations).filter((key) => key.startsWith('v'));
  const migrationVersions = prefixedVersions.map((key) => Number.parseInt(key.slice(1), 10)).sort((a, b) => a - b);

  if (version === 0 && !forceAllSteps) {
    await skipToLatestMigration(client, migrationVersions);
  } else {
    await applyAllFromCurrentToLatest(client, migrationVersions, version);
  }
}

async function skipToLatestMigration(client: PoolClient, migrationVersions: number[]): Promise<void> {
  const start = Date.now();
  const sql = readFileSync(resolve(__dirname, 'schema/latest.sql'), { encoding: 'utf-8' });
  const trimmedLines = sql.split('\n').map((line) => line.trim());

  for (const line of trimmedLines) {
    if (line === '') {
      continue;
    }

    if (line.startsWith('COPY')) {
      // Find the data
      const tableName = line.match(/public\."(.+?)"/)?.[1];
      if (!tableName) {
        throw new Error('Invalid migration. Unable to parse table name from COPY statement');
      }
      const dataFileStream = createReadStream(resolve(__dirname, `schema/data/${tableName}.tsv`), {
        encoding: 'utf-8',
      });
      const queryStream = client.query(copyFrom(line));
      await pipeline(dataFileStream, queryStream);
      continue;
    }

    await client.query(line);
  }

  const latestVersion = migrationVersions[migrationVersions.length - 1];
  globalLogger.info('Database schema migration', {
    version: `v${latestVersion}`,
    duration: `${Date.now() - start} ms`,
  });
}

async function applyAllFromCurrentToLatest(
  client: PoolClient,
  migrationVersions: number[],
  currentVersion: number
): Promise<void> {
  const start = Date.now();

  if (currentVersion === 0) {
    await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
      "id" INTEGER NOT NULL PRIMARY KEY,
      "version" INTEGER NOT NULL,
      "dataVersion" INTEGER NOT NULL
    )`);
    await client.query('INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (1, 0, 0)');
  }
  for (let i = currentVersion + 1; i <= migrationVersions.length; i++) {
    const migration = (migrations as Record<string, migrations.Migration>)[`v${i}`];
    if (migration) {
      const start = Date.now();
      await migration.run(client);
      globalLogger.info('Database schema migration', { version: `v${i}`, duration: `${Date.now() - start} ms` });
      await client.query('UPDATE "DatabaseMigration" SET "version"=$1', [i]);
    }
  }

  const latestVersion = migrationVersions[migrationVersions.length - 1];
  globalLogger.info('Database schema migration', {
    version: `v${latestVersion}`,
    duration: `${Date.now() - start} ms`,
  });
}
