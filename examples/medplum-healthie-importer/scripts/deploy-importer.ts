// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, MedplumClient, resolveId } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Bot configuration type.
 */
interface BotConfig {
  identifier: { system: string; value: string }[];
  name: string;
  description: string;
  sourceCode: { url: string };
  executableCode: { url: string };
}

// Define the import-healthie-patients bot
const IMPORTER_BOT: BotConfig = {
  identifier: [{ system: 'https://www.medplum.com', value: 'medplum-healthie-importer/import-healthie-patients' }],
  name: 'Healthie Patient Importer',
  description: 'Importer to import patients from Healthie',
  sourceCode: { url: 'src/import-healthie-patients.ts' },
  executableCode: { url: 'dist/import-healthie-patients.js' },
};

// Define the list-healthie-patients bot
const LIST_PATIENTS_BOT: BotConfig = {
  identifier: [{ system: 'https://www.medplum.com', value: 'medplum-healthie-importer/list-healthie-patients' }],
  name: 'Healthie Patient Lister',
  description: 'Lists all patient IDs from Healthie with filtering and pagination',
  sourceCode: { url: 'src/list-healthie-patients.ts' },
  executableCode: { url: 'dist/list-healthie-patients.js' },
};

// All bots to deploy
const ALL_BOTS: BotConfig[] = [IMPORTER_BOT, LIST_PATIENTS_BOT];

async function main(): Promise<void> {
  console.log('Installing Healthie importer bots...');

  // Parse command line arguments
  const program = new Command();
  program
    .name('deploy-importer')
    .description('Deploy Healthie importer bots to Medplum')
    .argument('<clientId>', 'Medplum client ID')
    .argument('<clientSecret>', 'Medplum client secret')
    .option('-u, --base-url <baseUrl>', 'Medplum base URL', 'https://api.medplum.com/')
    .parse();

  const [clientId, clientSecret] = program.args;
  const options = program.opts();

  const deployOptions: DeployOptions = {
    clientId,
    clientSecret,
    baseUrl: options.baseUrl,
  };

  const medplum = await connectToMedplum(deployOptions);

  // Deploy all bots
  for (const botConfig of ALL_BOTS) {
    await deployBot(medplum, botConfig);
  }

  console.log(`Successfully deployed ${ALL_BOTS.length} bots`);
}

/**
 * Creates a bot if it doesn't already exist in the Medplum project.
 *
 * @param medplum - The Medplum client instance
 * @param botConfig - The bot configuration
 * @returns Promise resolving to the bot resource with ID
 */
async function createOrUpdateBot(medplum: MedplumClient, botConfig: BotConfig): Promise<WithId<Bot>> {
  // Get the current project from the active login
  const project = medplum.getActiveLogin()?.project;
  if (!project) {
    throw new Error('No project found');
  }

  // Resolve the project ID from the project reference
  const projectId = resolveId(project) as string;

  // Extract source code and executable code files
  const { sourceCode: sourceCodeFile, executableCode: executableCodeFile, ...otherFields } = botConfig;
  if (!sourceCodeFile?.url || !executableCodeFile?.url) {
    throw new Error('Source code and executable code URL is required');
  }

  // Check if a bot with the same identifier already exists
  let existing = await medplum.searchOne('Bot', {
    identifier: `${botConfig.identifier[0].system}|${botConfig.identifier[0].value}`,
  });

  // Create attachments for source code and executable code
  const sourceCode = await medplum.createAttachment({
    data: readFileSync(sourceCodeFile.url, 'utf8'),
    contentType: 'text/typescript',
  });
  const executableCode = await medplum.createAttachment({
    data: readFileSync(executableCodeFile.url, 'utf8'),
    contentType: 'application/javascript',
  });

  // If bot already exists, return it without creating a new one
  if (!existing) {
    console.log(`No existing bot found for ${botConfig.name}. Creating...`);
    // Create the bot resource in the project
    existing = await medplum
      .post('admin/projects/' + projectId + '/bot', {
        name: botConfig.name,
        description: botConfig.description,
        sourceCode,
        executableCode,
      })
      .then((response) => {
        if (response.resourceType !== 'Bot') {
          throw new Error('Error Creating Bot: ' + response);
        }
        return response as WithId<Bot>;
      })
      .catch((e) => {
        throw new Error(e);
      });
    console.log(`Successfully created Bot/${existing.id}`);
  } else {
    console.log(`Found existing Bot/${existing.id} for ${botConfig.name}`);
  }

  // Update the bot with additional fields and runAsUser flag
  return medplum.updateResource<Bot>({
    ...existing,
    ...otherFields,
    sourceCode,
    executableCode,
    runAsUser: true,
  });
}

async function deployBot(medplum: MedplumClient, botConfig: BotConfig): Promise<void> {
  const bot = await createOrUpdateBot(medplum, botConfig);
  console.log('Deploying bot', bot.name, getReferenceString(bot));

  const id = bot.id;

  const codeFilename = botConfig.executableCode.url.replace('file://', '');
  const code = readFileSync(codeFilename, 'utf8');
  await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code, filename: path.basename(codeFilename) });
  console.log(`Successfully deployed ${botConfig.name}`);
}

interface DeployOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

async function connectToMedplum(options: DeployOptions): Promise<MedplumClient> {
  const medplum = new MedplumClient({
    baseUrl: options.baseUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
  });
  await medplum.startClientLogin(options.clientId, options.clientSecret);
  return medplum;
}

main().catch(console.error);
