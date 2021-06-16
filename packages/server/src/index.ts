import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { initDatabase } from './database';
import { initKeys } from './oauth';
import { initBinaryStorage } from './fhir';
import { logger } from './logger';

async function main() {
  logger.info('Starting Medplum Server...');

  const configName = process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json';
  logger.info('configName: ' + configName);

  const config = await loadConfig(configName);
  logger.info('config: ' + JSON.stringify(config, undefined, 2));

  await initDatabase(config.database);
  await initKeys(config);
  await initBinaryStorage(config.binaryStorage);

  const app = await initApp(express());
  app.listen(5000);
}

main();
