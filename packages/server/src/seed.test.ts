import { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config';
import { getDatabasePool } from './database';
import { SelectQuery } from './fhir/sql';
import { seedDatabase } from './seed';
import { withTestContext } from './test.setup';

describe('Seed', () => {
  test('Seeder completed successfully', async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.database.runMigrations = true;
    await withTestContext(() => initAppServices(config)); // This runs the seeder!

    // Make sure all database migrations have run
    const pool = getDatabasePool();
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

    await shutdownApp();
  }, 240000);
});
