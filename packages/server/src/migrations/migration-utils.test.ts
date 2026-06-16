// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { loadTestConfig } from '../config/loader';
import { closeDatabase, initDatabase } from '../database';
import {
  getPostDeployMigration,
  MigrationDefinitionNotFoundError,
  withLongRunningDatabaseClient,
} from './migration-utils';

describe('withLongRunningDatabaseClient', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should execute callback with long-running database client', async () => {
    const result = await withLongRunningDatabaseClient(async (client) => {
      return client.query<{ result: string }>("SELECT '12-12-2022' as result").then((result) => result.rows[0].result);
    });
    expect(result).toBe('12-12-2022');
  });
});

describe('getPostDeployMigration', () => {
  test('definition found', () => {
    expect(getPostDeployMigration(1)).toBeDefined();
  });

  test('migration definition not found', () => {
    expect(() => getPostDeployMigration(9999)).toThrow(MigrationDefinitionNotFoundError);
  });
});
