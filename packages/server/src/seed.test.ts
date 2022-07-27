import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
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

    // Second time, seeder should silently ignore
    await seedDatabase();
  }, 240000);
});
