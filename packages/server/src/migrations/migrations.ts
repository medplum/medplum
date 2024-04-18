import { normalizeErrorString, sleep } from '@medplum/core';
import { PoolClient } from 'pg';
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

  const migrationKeys = Object.keys(migrations).filter((key) => key.startsWith('v'));
  const migrationVersions = migrationKeys.map((key) => Number.parseInt(key.slice(1), 10)).sort((a, b) => a - b);

  if (version === 0 && !forceAllSteps) {
    const start = Date.now();
    await migrations.latest.run(client);
    const latestVersion = migrationVersions[migrationVersions.length - 1];
    globalLogger.info('Database schema migration', {
      version: `v${latestVersion}`,
      duration: `${Date.now() - start} ms`,
    });
    for (let i = 0; i < 5; i++) {
      await sleep(1000);
      try {
        await client.query('INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (1, $1, 0)', [
          latestVersion,
        ]);
        break;
      } catch (_err) {
        console.log(`Retrying... Attempt #${i + 1}`);
      }
    }
  } else {
    if (version === 0) {
      await client.query(`CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
        "id" INTEGER NOT NULL PRIMARY KEY,
        "version" INTEGER NOT NULL,
        "dataVersion" INTEGER NOT NULL
      )`);
      await client.query('INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (1, 0, 0)');
    }
    for (let i = version + 1; i <= migrationKeys.length; i++) {
      const migration = (migrations as Record<string, migrations.Migration>)[`v${i}`];
      if (migration) {
        const start = Date.now();
        await migration.run(client);
        globalLogger.info('Database schema migration', { version: `v${i}`, duration: `${Date.now() - start} ms` });
        await client.query('UPDATE "DatabaseMigration" SET "version"=$1', [i]);
      }
    }
  }
}
