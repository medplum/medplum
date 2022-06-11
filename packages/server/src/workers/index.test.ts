import { vi } from 'vitest';
import { closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from '../fhir/storage';
import { seedDatabase } from '../seed';

vi.mock('bullmq');

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
