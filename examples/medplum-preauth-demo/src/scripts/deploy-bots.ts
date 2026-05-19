// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, MedplumClient, getReferenceString, normalizeErrorString, resolveId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

config({ path: existsSync('.env') ? '.env' : '.env.defaults' });

interface BotDescription {
  name: string;
  description: string;
  src: string;
  dist: string;
}

const BOTS: BotDescription[] = [
  {
    name: 'generate-magic-link',
    description: 'Generates a pre-authorized code magic link on behalf of a patient',
    src: 'src/bots/generate-magic-link.ts',
    dist: 'dist/bots/generate-magic-link.js',
  },
];

async function main(): Promise<void> {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET must be set in your .env file.');
    console.error('Add your client secret to .env as MEDPLUM_CLIENT_SECRET=<your-secret>');
    process.exit(1);
  }

  console.log('Connecting to https://api.medplum.com/...');
  const medplum = new MedplumClient({ clientId });
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

  // Write bot IDs to a file so the user can copy them into .env
  const envLines = Object.entries(botIds)
    .map(([, id]) => `MEDPLUM_BOT_ID=${id}`)
    .join('\n');
  writeFileSync('dist/bot-ids.txt', envLines + '\n');

  console.log('\nBot IDs written to dist/bot-ids.txt');
  console.log('Copy the following into your .env file:\n');
  console.log(envLines);
  console.log('\nNext: set the bot secret CLIENT_ID in the Medplum app:');
  console.log('  app.medplum.com → Project → Secrets → Add: CLIENT_ID = <your MEDPLUM_CLIENT_ID>');
}

async function deployBot(medplum: MedplumClient, projectId: string, botDescription: BotDescription): Promise<string> {
  console.log(`Deploying bot: ${botDescription.name}`);

  // Create or find existing bot
  let bot = await medplum.searchOne('Bot', { name: botDescription.name });

  if (!bot) {
    console.log(`  Creating new bot...`);
    bot = (await medplum.post(`admin/projects/${projectId}/bot`, {
      name: botDescription.name,
      description: botDescription.description,
    })) as Bot & { id: string };
    console.log(`  Created ${getReferenceString(bot)}`);
  } else {
    console.log(`  Found existing ${getReferenceString(bot)}`);
  }

  if (!bot.id) {
    throw new Error(`Bot ${botDescription.name} has no ID after creation`);
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
    await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), {
      code: readFileSync(botDescription.dist, 'utf8'),
      filename: path.basename(botDescription.dist),
    });
    console.log(`  Done: ${botDescription.name} (${bot.id})`);
  } catch (err) {
    console.error(`  Deploy failed: ${normalizeErrorString(err)}`);
    throw err;
  }

  // Grant the bot Project Admin so it can call /auth/preauthorize
  const membershipBundle = await medplum.get(
    medplum.fhirUrl('ProjectMembership') + `?profile=Bot/${bot.id}`
  ) as { entry?: { resource?: { id?: string; admin?: boolean; [key: string]: unknown } }[] };
  const membership = membershipBundle.entry?.[0]?.resource;
  if (membership?.id) {
    if (!membership.admin) {
      await medplum.put(medplum.fhirUrl('ProjectMembership', membership.id), { ...membership, admin: true });
      console.log(`  Granted bot Project Admin`);
    } else {
      console.log(`  Bot already has Project Admin`);
    }
  } else {
    console.warn(`  Warning: could not find ProjectMembership for bot — grant admin manually in the Medplum app`);
  }

  return bot.id as string;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
