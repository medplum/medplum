// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, MedplumClient, getReferenceString, normalizeErrorString, resolveId } from '@medplum/core';
import type { AccessPolicy, Bot, Subscription } from '@medplum/fhirtypes';
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SIGNER_ACCESS_POLICY_NAME } from '../constants';
import { CONSENT_QUESTIONNAIRE } from '../data/consent';

config({ path: existsSync('.env') ? '.env' : '.env.defaults' });

interface BotDescription {
  name: string;
  description: string;
  src: string;
  dist: string;
  /** Project Admin is only needed to call /auth/preauthorize and invite patients */
  admin?: boolean;
}

const BOTS: BotDescription[] = [
  {
    name: 'generate-magic-link',
    description: 'Generates a pre-authorized code magic link on behalf of a patient',
    src: 'src/bots/generate-magic-link.ts',
    dist: 'dist/bots/generate-magic-link.js',
    admin: true,
  },
  {
    name: 'create-consent',
    description: 'Creates Consent resources and a signed PDF from a submitted consent questionnaire',
    src: 'src/bots/create-consent.ts',
    dist: 'dist/bots/create-consent.js',
  },
];

// The patient's token can read the consent questionnaire and their own Patient, and submit (but not edit or delete)
// their own response to that questionnaire
const SIGNER_ACCESS_POLICY: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: SIGNER_ACCESS_POLICY_NAME,
  resource: [
    {
      resourceType: 'Questionnaire',
      criteria: `Questionnaire?url=${CONSENT_QUESTIONNAIRE.url}`,
      interaction: ['read'],
    },
    { resourceType: 'Patient', criteria: 'Patient?_id=%profile.id', interaction: ['read'] },
    {
      resourceType: 'QuestionnaireResponse',
      criteria: `QuestionnaireResponse?subject=%profile&questionnaire=${CONSENT_QUESTIONNAIRE.url}`,
      interaction: ['create', 'read'],
    },
  ],
};

async function main(): Promise<void> {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET must be set in your .env file.');
    console.error('Add your client secret to .env as MEDPLUM_CLIENT_SECRET=<your-secret>');

    process.exit(1);
  }

  const baseUrl = process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/';
  console.log(`Connecting to ${baseUrl}...`);
  const medplum = new MedplumClient({ baseUrl, clientId });
  await medplum.startClientLogin(clientId, clientSecret);

  const projectId = resolveId(medplum.getActiveLogin()?.project);
  if (!projectId) {
    throw new Error('Could not determine project ID from active login');
  }
  console.log(`Deploying to project ${projectId}\n`);

  const botIds: Record<string, string> = {};

  for (const botDescription of BOTS) {
    const id = await deployBot(medplum, projectId, botDescription);
    botIds[botDescription.name] = id;
  }

  await medplum.upsertResource(SIGNER_ACCESS_POLICY, { name: SIGNER_ACCESS_POLICY_NAME });
  console.log(`\nUpserted AccessPolicy: ${SIGNER_ACCESS_POLICY_NAME}`);

  // Extract Consents server-side whenever a consent questionnaire is submitted
  await medplum.upsertResource<Subscription>(
    {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'Create Consent resources from signed consent questionnaires',
      criteria: `QuestionnaireResponse?questionnaire=${CONSENT_QUESTIONNAIRE.url}`,
      // Only on create. Without this, updating or deleting a response would run the bot again.
      extension: [
        { url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction', valueCode: 'create' },
      ],
      channel: { type: 'rest-hook', endpoint: `Bot/${botIds['create-consent']}`, payload: ContentType.FHIR_JSON },
    },
    { url: `Bot/${botIds['create-consent']}` }
  );
  console.log('Upserted Subscription: QuestionnaireResponse -> create-consent');

  const envLine = `MEDPLUM_BOT_ID=${botIds['generate-magic-link']}`;
  writeFileSync('dist/bot-ids.txt', envLine + '\n');
  console.log('\nBot IDs written to dist/bot-ids.txt');
  console.log('Copy the following into your .env file:\n');
  console.log(envLine);
  console.log('\nNext: set the bot secret CLIENT_ID in the Medplum app:');
  console.log('  app.medplum.com → Project → Secrets → Add: CLIENT_ID = <your MEDPLUM_CLIENT_ID>');
}

async function deployBot(medplum: MedplumClient, projectId: string, botDescription: BotDescription): Promise<string> {
  console.log(`Deploying bot: ${botDescription.name}`);

  // Create or find existing bot
  let bot = await medplum.searchOne('Bot', { name: botDescription.name });

  if (!bot) {
    console.log(`  Creating new bot...`);
    bot = await medplum.post(`admin/projects/${projectId}/bot`, {
      name: botDescription.name,
      description: botDescription.description,
    });
    console.log(`  Created ${getReferenceString(bot)}`);
  } else {
    console.log(`  Found existing ${getReferenceString(bot)}`);
  }

  // Upload source and compiled code as attachments
  const sourceCode = await medplum.createAttachment({
    data: readFileSync(botDescription.src, 'utf8'),
    filename: path.basename(botDescription.src),
    contentType: ContentType.TYPESCRIPT,
  });

  const executableCode = await medplum.createAttachment({
    data: readFileSync(botDescription.dist, 'utf8'),
    filename: path.basename(botDescription.dist),
    contentType: ContentType.JAVASCRIPT,
  });

  // Update bot metadata
  bot = await medplum.updateResource<Bot>({
    ...bot,
    resourceType: 'Bot',
    name: botDescription.name,
    description: botDescription.description,
    runtimeVersion: 'awslambda',
    sourceCode,
    executableCode,
  });

  // Deploy (compile and activate) the bot
  console.log(`  Deploying...`);
  try {
    await medplum.post(medplum.fhirUrl('Bot', bot.id, '$deploy'), {
      code: readFileSync(botDescription.dist, 'utf8'),
      filename: path.basename(botDescription.dist),
    });
    console.log(`  Done: ${botDescription.name} (${bot.id})`);
  } catch (err) {
    console.error(`  Deploy failed: ${normalizeErrorString(err)}`);
    throw err;
  }

  if (!botDescription.admin) {
    return bot.id;
  }

  // Grant the bot Project Admin so it can call /auth/preauthorize
  const membership = await medplum.searchOne('ProjectMembership', { profile: getReferenceString(bot) });
  if (!membership) {
    console.warn(`  Warning: could not find ProjectMembership for bot — grant admin manually in the Medplum app`);
  } else if (membership.admin) {
    console.log(`  Bot already has Project Admin`);
  } else {
    await medplum.updateResource({ ...membership, admin: true });
    console.log(`  Granted bot Project Admin`);
  }

  return bot.id;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
