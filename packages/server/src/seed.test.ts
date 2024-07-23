import { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config';
import { DatabaseMode, getDatabasePool } from './database';
import { SelectQuery } from './fhir/sql';
import { seedDatabase } from './seed';
import { withTestContext } from './test.setup';

describe('Seed', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.database.runMigrations = true;
    return withTestContext(() => initAppServices(config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Seeder completes successfully', async () => {
    // First time, seeder should run
    await seedDatabase();

    // Make sure all database migrations have run
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const result = await pool.query('SELECT "version" FROM "DatabaseMigration"');
    const version = result.rows[0]?.version ?? -1;
    expect(version).toBeGreaterThanOrEqual(67);

    // Make sure the first project is a super admin
    const rows = await new SelectQuery('Project').column('content').where('name', '=', 'Super Admin').execute(pool);
    expect(rows.length).toBe(1);

    const project = JSON.parse(rows[0].content) as Project;
    expect(project.superAdmin).toBe(true);
    expect(project.strictMode).toBe(true);

    // Second time, seeder should silently ignore
    await seedDatabase();
  });
});
