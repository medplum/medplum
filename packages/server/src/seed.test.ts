import { Project } from '@medplum/fhirtypes';
import { shutdownApp } from './app';
import { loadTestConfig } from './config';
import { AuthenticatedRequestContext, requestContextStore } from './context';
import { getDatabasePool, initDatabase } from './database';
import { SelectQuery } from './fhir/sql';
import { loadStructureDefinitions } from './fhir/structure';
import { initRedis } from './redis';
import { seedDatabase } from './seed';
import { withTestContext } from './test.setup';

describe('Seed', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.database.runMigrations = true;

    // We load the minimal required to get things running so this actually tests seeding the database
    return withTestContext(() =>
      requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
        loadStructureDefinitions();
        initRedis(config.redis);
        await initDatabase(config);
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Seeder completes successfully', async () => {
    // First time, seeder should run
    await seedDatabase();

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
  }, 240000);
});
