import { loadTestConfig } from './config';
import { closeDatabase, getClient, initDatabase } from './database';
import { Operator, SelectQuery } from './fhir/sql';
import { closeRedis, initRedis } from './redis';
import { seedDatabase } from './seed';

describe('Seed', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  test('Seeder completes successfully', async () => {
    // First time, seeder should run
    await seedDatabase();

    // Make sure the first user is a super admin
    const rows = await new SelectQuery('User')
      .column('content')
      .where('email', Operator.EQUALS, 'admin@example.com')
      .execute(getClient());
    const user = JSON.parse(rows[0].content);
    expect(user.admin).toBe(true);

    // Second time, seeder should silently ignore
    await seedDatabase();
  }, 240000);
});
