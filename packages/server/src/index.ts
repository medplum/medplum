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

export async function main(configName: string): Promise<void> {
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled promise rejection', err);
  });
  process.on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception thrown');
    process.exit(1);
  });

  logger.info('Starting Medplum Server...');
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
  app.listen(config.port);
}

if (require.main === module) {
  main(process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json');
}
