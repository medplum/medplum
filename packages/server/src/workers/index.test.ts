import { closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from '../fhir/storage';
import { getStructureDefinitions } from '../fhir/structure';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';

describe('Workers', () => {
  beforeAll(() => {
    getStructureDefinitions();
  });

  test('Init and close', async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
    initBinaryStorage('file:binary');
    initWorkers(config);
    await closeWorkers();
    await closeDatabase();
    closeRedis();
  });
});
