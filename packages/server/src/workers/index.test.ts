import { closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from '../fhir';
import { seedDatabase } from '../seed';

jest.mock('bullmq');

describe('Workers', () => {
  test('Init and close', async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initBinaryStorage('file:binary');
    initWorkers(config.redis);
    await closeWorkers();
    await closeDatabase();
  });
});
