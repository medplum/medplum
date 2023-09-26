import { closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from '../fhir/storage';
import { getStructureDefinitions } from '../fhir/structure';
import { closeRedis, initRedis } from '../redis';
import { SEEDS } from '../seeds';

describe('Workers', () => {
  beforeAll(() => {
    getStructureDefinitions();
  });

  test('Init and close', async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await SEEDS.systemBase.run();
    initBinaryStorage('file:binary');
    initWorkers(config.redis);
    await closeWorkers();
    await closeDatabase();
    closeRedis();
  });
});
