import { indexSearchParameterBundle, indexStructureDefinitionBundle, loadDataTypes } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import express from 'express';
import { initApp } from './app';
import { loadConfig } from './config';
import { logger } from './logger';

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

  // Preload the schema
  const dataTypes = readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>;
  const resourceTypes = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
  indexStructureDefinitionBundle(dataTypes);
  indexStructureDefinitionBundle(resourceTypes);
  indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  loadDataTypes(dataTypes);
  loadDataTypes(resourceTypes);

  const app = await initApp(express(), config);
  app.listen(config.port);
  logger.info('Server started on port', config.port);
}

if (require.main === module) {
  main(process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json').catch(console.log);
}
