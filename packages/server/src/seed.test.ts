import { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config';
import { getClient } from './database';
import { Operator, SelectQuery } from './fhir/sql';
import { seedDatabase } from './seed';
import { withTestContext } from './test.setup';

describe('Seed', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    return withTestContext(() => initAppServices(config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Seeder completes successfully', async () => {
    // First time, seeder should run
    await seedDatabase();

    // Make sure the first project is a super admin
    const rows = await new SelectQuery('Project')
      .column('content')
      .where('name', Operator.EQUALS, 'Super Admin')
      .execute(getClient());
    expect(rows.length).toBe(1);

    const project = JSON.parse(rows[0].content) as Project;
    expect(project.superAdmin).toBe(true);

    // Second time, seeder should silently ignore
    await seedDatabase();
  }, 240000);
});
