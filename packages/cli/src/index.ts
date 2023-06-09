import { MEDPLUM_VERSION, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { login, whoami } from './auth';
import { aws } from './aws/index';
import { bot, createBotDeprecate, deployBotDeprecate, saveBotDeprecate } from './bots';
import { bulk } from './bulk';
import { project } from './project';
import { deleteObject, get, patch, post, put } from './rest';
import { FileSystemStorage } from './storage';
import { onUnauthenticated } from './util/client';

export let medplum: MedplumClient;

export async function main(medplumClient: MedplumClient, argv: string[]): Promise<void> {
  medplum = medplumClient;

  try {
    const clientId = process.env['MEDPLUM_CLIENT_ID'];
    const clientSecret = process.env['MEDPLUM_CLIENT_SECRET'];
    if (clientId && clientSecret) {
      medplumClient.setBasicAuth(clientId, clientSecret);
      await medplumClient.startClientLogin(clientId, clientSecret);
    }
    const index = new Command('medplum').description('Command to access Medplum CLI');
    index.version(MEDPLUM_VERSION);

    // Auth commands
    index.addCommand(login);
    index.addCommand(whoami);

    // REST commands
    index.addCommand(get);
    index.addCommand(post);
    index.addCommand(patch);
    index.addCommand(put);
    index.addCommand(deleteObject);

    // Project
    index.addCommand(project);

    // Export
    index.addCommand(bulk);

    // Bot Commands
    index.addCommand(bot);

    // Deprecated Bot Commands
    index.addCommand(saveBotDeprecate);
    index.addCommand(deployBotDeprecate);
    index.addCommand(createBotDeprecate);

    // AWS commands
    index.addCommand(aws);

    await index.parseAsync(argv);
  } catch (err) {
    console.error('Error: ' + normalizeErrorString(err));
  }
}

export async function run(): Promise<void> {
  dotenv.config();
  const baseUrl = process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
  const fhirUrlPath = process.env['MEDPLUM_FHIR_URL_PATH'] || '';
  const accessToken = process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] || '';
  const tokenUrl = process.env['MEDPLUM_TOKEN_URL'] || '';

  const medplumClient = new MedplumClient({
    fetch,
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    storage: new FileSystemStorage(),
    onUnauthenticated: onUnauthenticated,
  });

  if (accessToken) {
    medplumClient.setAccessToken(accessToken);
  }
  await main(medplumClient, process.argv);
}

if (require.main === module) {
  run().catch((err) => console.error('Unhandled error:', err));
}
