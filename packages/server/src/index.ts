import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { initDatabase } from './database';

async function main() {
  const configName = process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json';
  console.log('configName', configName);

  const config = await loadConfig(configName);
  console.log('config', config);

  // const envName = process.argv.length === 3 ? process.argv[2] : 'localhost';
  // console.log('envName', envName);

  // const config = await loadConfig(envName);
  // console.log('config', config);

  // const secrets = await getSecrets('arn:aws:secretsmanager:us-east-1:647991932601:secret:MedplumStackBackEndDatabase-EGCWqzSdj8J9-MsYQit');
  // console.log('secrets', secrets);

  await initDatabase(config.database);

  const app = await initApp(express());
  app.listen(5000);
}

main();
