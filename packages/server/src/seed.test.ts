import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { seedDatabase } from './seed';

describe('Seed', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Seeder completes successfully', async () => {
    // First time, seeder should run
    await seedDatabase();

    // Second time, seeder should silently ignore
    await seedDatabase();
  });

});
