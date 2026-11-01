// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Deploys the Google Calendar Bots and their OperationDefinitions into the shared Medplum
 * project that customers link to.
 */

import { createReference, MedplumClient } from '@medplum/core';
import type { Bot, OperationDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { execFileSync } from 'node:child_process';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE } from '../common/constants';

import { projectQuery } from '../common/project';
import { assertDeploymentProject, cliAccessToken } from './deployment-auth';
import { ifMatch } from '../common/lease';
import { CONTRACTS } from '../common/contracts';

const BASE_URL = process.env.BASE_URL ?? process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const PROJECT_ID = requireEnv('PROJECT_ID');
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== '--cli' && arg !== '--check' && arg !== '--e2e') {
    throw new Error(`Unknown deployment option: ${arg}`);
  }
}

const OPERATION_DEFINITION_IMPLEMENTATION_URL =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

/** A range sync or reconcile walks every appointment in range, and disconnect every event; the default 10-second Bot timeout covers ~25 calls. */
const LONG_TIMEOUT_SECONDS = 600;

interface BotDefinition {
  identifier: string;
  name: string;
  description: string;
  /** Runs as the caller (operations), or as its own membership in the customer project (Subscription). */
  runAsUser: boolean;
  timeout?: number;
  publicWebhook?: boolean;
}

const botDefinitions: BotDefinition[] = [
  {
    identifier: BOT_IDENTIFIER_VALUE.settings,
    name: 'Google Calendar Settings Bot',
    description: 'Change the practitioner detail level and queue privacy cleanup',
    runAsUser: false,
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.inbound,
    name: 'Google Calendar Import Bot',
    description: 'Import owned busy Slots and complete disconnect cleanup',
    runAsUser: false,
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.webhook,
    name: 'Google Calendar Webhook Bot',
    description: 'Authenticate Google notifications and request durable import work',
    runAsUser: false,
    publicWebhook: true,
    timeout: 30,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.sync,
    name: 'Google Calendar Sync Bot',
    timeout: LONG_TIMEOUT_SECONDS,
    description: 'Mirror Appointment and Slot changes to practitioners’ Google Calendars',
    runAsUser: false,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.syncRange,
    name: 'Google Calendar Sync Range Bot',
    description: 'Push a practitioner’s appointments and blocked time within a date range to their calendar',
    runAsUser: false,
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.reconcile,
    name: 'Google Calendar Reconcile Bot',
    description: 'Queue hourly repair in both directions; process outbound connection work',
    runAsUser: false,
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.connect,
    name: 'Google Calendar Connect Bot',
    description: 'Exchange the OAuth code and store a practitioner’s Calendar Connection',
    runAsUser: false,
    // Connection writes share the worker lease; account switching requires explicit disconnect.
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.status,
    name: 'Google Calendar Status Bot',
    description: 'Read caller-authorized connection status and conflicts',
    runAsUser: true,
    timeout: 120,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.disconnect,
    name: 'Google Calendar Disconnect Bot',
    description: 'Remove mirrored events, revoke access and delete the Calendar Connection',
    runAsUser: false,
    timeout: LONG_TIMEOUT_SECONDS,
  },
  {
    identifier: BOT_IDENTIFIER_VALUE.install,
    name: 'Install Google Calendar Bot',
    timeout: LONG_TIMEOUT_SECONDS,
    description: 'Configure a customer project with the Google Calendar sync',
    runAsUser: true,
  },
];

async function main(): Promise<void> {
  if (args.has('--e2e')) {
    if (!args.has('--cli') || args.has('--check')) {
      throw new Error('--e2e requires --cli and cannot be combined with --check');
    }
    requireEnv('E2E_MANIFEST');
  }
  const medplum = args.has('--cli')
    ? new MedplumClient({ baseUrl: BASE_URL })
    : new MedplumClient({
        baseUrl: BASE_URL,
        clientId: requireEnv('CLIENT_ID'),
        clientSecret: requireEnv('CLIENT_SECRET'),
      });
  if (args.has('--cli')) {
    medplum.setAccessToken(cliAccessToken(BASE_URL, process.env.MEDPLUM_PROFILE));
  }
  await assertDeploymentProject(medplum, PROJECT_ID);
  // Check all local artifacts before the first remote write.
  const bundles = new Map(
    botDefinitions.map((definition) => [
      definition.identifier,
      readFileSync(`dist/bots/${definition.identifier}.js`, 'utf8'),
    ])
  );
  console.log(`Target: ${BASE_URL} Project/${PROJECT_ID}`);
  if (args.has('--check')) {
    console.log(
      `Preflight passed: authenticated project and ${bundles.size} local bundles checked. No resources changed.`
    );
    console.log('Write permissions, installation and Google authorization still require live verification.');
    return;
  }
  console.log('Installing Google Calendar bots and OperationDefinitions...');
  const botMap = new Map<string, Bot>();
  for (const definition of botDefinitions) {
    const bot = await createOrUpdateBot(medplum, definition);
    console.log(`${definition.name}: ${bot.id}`);
    await deployBot(medplum, bot, definition.identifier, bundles.get(definition.identifier) as string);
    botMap.set(definition.identifier, bot);
  }

  console.log('\nInstalling OperationDefinitions...');
  for (const opDef of Object.values(CONTRACTS)) {
    const bot = botMap.get(opDef.botIdentifier);
    if (!bot) {
      console.error(`Bot not found for operation ${opDef.definition.code}: ${opDef.botIdentifier}`);
      continue;
    }
    await upsertOperationDefinition(medplum, opDef, bot);
  }

  console.log('\nDeployment complete.');
  if (args.has('--e2e')) {
    execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/e2e.ts'], { stdio: 'inherit' });
  }
}

async function createOrUpdateBot(medplum: MedplumClient, definition: BotDefinition): Promise<Bot> {
  const matches = await medplum.searchResources(
    'Bot',
    await projectQuery(medplum, { identifier: `${BOT_IDENTIFIER_SYSTEM}|${definition.identifier}`, _count: '2' })
  );
  if (matches.length > 1) {
    throw new Error('Duplicate integration Bots require administrator repair');
  }
  const existing = matches[0];
  const bot = existing ?? (await medplum.post(`admin/projects/${PROJECT_ID}/bot`, { name: definition.name }));
  return medplum.updateResource<Bot>({
    ...bot,
    resourceType: 'Bot',
    name: definition.name,
    description: definition.description,
    identifier: [{ system: BOT_IDENTIFIER_SYSTEM, value: definition.identifier }],
    runAsUser: definition.runAsUser,
    publicWebhook: definition.publicWebhook ?? false,
    // No shared-project systemSecret is read; keep this explicit so a redeploy clears an older setting.
    system: false,
    ...(definition.timeout ? { timeout: definition.timeout } : {}),
  });
}

async function deployBot(medplum: MedplumClient, bot: Bot, baseFilename: string, code: string): Promise<void> {
  await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), { code, filename: `${baseFilename}.js` });
}

async function upsertOperationDefinition(
  medplum: MedplumClient,
  config: (typeof CONTRACTS)[string],
  bot: Bot
): Promise<OperationDefinition> {
  const operationDefinition: OperationDefinition = {
    ...config.definition,
    extension: [{ url: OPERATION_DEFINITION_IMPLEMENTATION_URL, valueReference: createReference(bot) }],
  };
  const saved = await medplum.createResourceIfNoneExist(
    operationDefinition,
    await projectQuery(medplum, { url: operationDefinition.url as string })
  );
  return medplum.updateResource({ ...operationDefinition, id: saved.id, meta: saved.meta }, ifMatch(saved));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
