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

export let medplum: MedplumClient;

export async function main(medplumClient: MedplumClient, argv: string[]): Promise<void> {
  medplum = medplumClient;

  // Legacy support for MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET environment variables
  const clientId = process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = process.env['MEDPLUM_CLIENT_SECRET'];
  if (clientId && clientSecret) {
    await medplum.startClientLogin(clientId, clientSecret);
  }
  try {
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

export function run(): void {
  dotenv.config();
  const baseUrl = process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
  const fhirUrlPath = process.env['MEDPLUM_FHIR_URL_PATH'] || '';
  const accessToken = process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] || '';

  const medplumClient = new MedplumClient({
    fetch,
    baseUrl,
    fhirUrlPath,
    storage: new FileSystemStorage(),
    onUnauthenticated: onUnauthenticated,
  });

  if (accessToken) {
    medplumClient.setAccessToken(accessToken);
  }
  main(medplumClient, process.argv).catch((err) => console.error('Unhandled error:', err));
}

if (require.main === module) {
  run();
}

function onUnauthenticated(): void {
  console.log('Unauthenticated: run `npx medplum login` to sign in');
}
