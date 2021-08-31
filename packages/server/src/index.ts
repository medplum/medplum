import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { initDatabase } from './database';
import { initBinaryStorage } from './fhir';
import { logger } from './logger';
import { initKeys } from './oauth';
import { seedDatabase } from './seed';
import { initWebhookWorker } from './workers/webhooks';

async function main() {
  logger.info('Starting Medplum Server...');

  const configName = process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json';
  logger.info('configName: ' + configName);

  const config = await loadConfig(configName);
  logger.info('config: ' + JSON.stringify(config, undefined, 2));

  await initDatabase(config.database);
  await initKeys(config);
  await seedDatabase();
  initBinaryStorage(config.binaryStorage);
  initWebhookWorker(config.redis);

  const app = await initApp(express());
  app.listen(5000);
}

main();
