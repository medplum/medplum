import { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../src/app';
import { loadTestConfig } from '../src/config';
import { getDatabasePool } from '../src/database';
import { SelectQuery } from '../src/fhir/sql';
import { seedDatabase } from '../src/seed';
import { withTestContext } from '../src/test.setup';

describe('Seed', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.database.port = process.env['POSTGRES_SEED_PORT']
      ? Number.parseInt(process.env['POSTGRES_SEED_PORT'], 10)
      : 5433;
    return withTestContext(() => initAppServices(config));
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
