import { loadConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { seedDatabase } from './seed';

beforeAll(async () => {
  await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
});

afterAll(async () => {
  await closeDatabase();
});

test('Seeder completes successfully', async (done) => {
  // First time, seeder should run
  await seedDatabase();

  // Second time, seeder should silently ignore
  await seedDatabase();

  done();
});
