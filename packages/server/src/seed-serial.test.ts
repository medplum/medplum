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

describe('Seed Serial', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.database.port = process.env['POSTGRES_SEED_PORT']
      ? Number.parseInt(process.env['POSTGRES_SEED_PORT'], 10)
      : 5433;
    // Keep Redis separate so caches between main test suite and this are separate
    config.redis.db = 8;

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

  test('Seeder completes successfully -- serial version', async () => {
    // First time, seeder should run
    await seedDatabase({ parallel: false });

    // Make sure the first project is a super admin
    const rows = await new SelectQuery('Project')
      .column('content')
      .where('name', '=', 'Super Admin')
      .execute(getDatabasePool());
    expect(rows.length).toBe(1);

    const project = JSON.parse(rows[0].content) as Project;
    expect(project.superAdmin).toBe(true);
    expect(project.strictMode).toBe(true);

    // Second time, seeder should silently ignore
    await seedDatabase({ parallel: false });
  }, 240000);
});
