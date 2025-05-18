import { loadConfig } from '../config/loader';
import { AuthenticatedRequestContext } from '../context';
import { initDatabase } from '../database';
import { loadStructureDefinitions } from '../fhir/structure';
import { initKeys } from '../oauth/keys';
import { initRedis } from '../redis';
import { requestContextStore } from '../request-context-store';
import { seedDatabase } from '../seed';
import { initBinaryStorage } from '../storage/loader';
import { initReindexWorker } from '../workers/reindex';

async function main(): Promise<void> {
  const config = await loadConfig('file:medplum.config.json');
  await requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
    loadStructureDefinitions();
    initRedis(config.redis);
    await initDatabase(config);
    await seedDatabase();
    await initKeys(config);
    initBinaryStorage(config.binaryStorage);
    initReindexWorker(config);
  });
}

main()
  .then(() => console.log('Done'))
  .catch((err) => {
    console.error(err);
    console.error(JSON.stringify(err, null, 2));
  });
