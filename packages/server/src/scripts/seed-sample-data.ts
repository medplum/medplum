// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { loadConfig } from '../config/loader';
import { initDatabase } from '../database';
import { loadStructureDefinitions } from '../fhir/structure';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { initRedis } from '../redis';
import { seedSampleData } from '../seeds/sampledata';
import { AuthenticatedRequestContext } from '../context';
import { requestContextStore } from '../request-context-store';

async function main(): Promise<void> {
  const config = await loadConfig(process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json');

  globalLogger.info('Initializing services...');
  loadStructureDefinitions();
  initRedis(config.redis);

  await requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
    await initDatabase(config);
    const systemRepo = getSystemRepo();

    globalLogger.info('Starting sample data seeding...');
    const startTime = Date.now();

    try {
      await seedSampleData(systemRepo);
      globalLogger.info('Finished seeding sample data', { durationMs: Date.now() - startTime });
    } catch (error) {
      globalLogger.error('Error seeding sample data', { error });
      process.exit(1);
    }
  });

  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
