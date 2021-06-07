import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { initDatabase } from './database';
import { initKeys } from './oauth';

async function main() {
  const configName = process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json';
  console.log('configName', configName);

  const config = await loadConfig(configName);
  console.log('config', config);

  await initDatabase(config.database);
  await initKeys(config);

  const app = await initApp(express());
  app.listen(5000);
}

main();
