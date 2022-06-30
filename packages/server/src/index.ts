import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { initDatabase } from './database';
import { initBinaryStorage } from './fhir';
import { getRootSchema } from './fhir/operations/graphql';
import { logger } from './logger';
import { initKeys } from './oauth';
import { initRedis } from './redis';
import { seedDatabase } from './seed';
import { initWorkers } from './workers';

async function main(): Promise<void> {
  logger.info('Starting Medplum Server...');

  const configName = process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json';
  logger.info('configName: ' + configName);

  const config = await loadConfig(configName);
  logger.info('config: ' + JSON.stringify(config, undefined, 2));

  await initDatabase(config.database);
  initRedis(config.redis);
  await initKeys(config);
  await seedDatabase();
  initBinaryStorage(config.binaryStorage);
  initWorkers(config.redis);
  getRootSchema();

  const app = await initApp(express());
  app.listen(5000);
}

main();
