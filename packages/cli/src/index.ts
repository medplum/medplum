#!/usr/bin/env node
import { MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import fetch from 'node-fetch';
import { resolve } from 'path';

export async function main(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 3) {
    console.log('Usage: medplum <command>');
    return;
  }

  const command = argv[2];
  if (command === 'deploy-bot') {
    await deployBot(medplum, argv);
  } else {
    console.log(`Unknown command: ${command}`);
  }
}

async function deployBot(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 5) {
    console.log('Usage: medplum deploy-bot <bot-name> <bot-id>');
    return;
  }

  const botId = argv[4];
  if (!botId) {
    console.log('Error: Bot ID is not set');
    return;
  }

  const filePath = resolve(process.cwd(), argv[3]);
  if (!existsSync(filePath)) {
    console.log('Error: Bot file does not exist: ' + filePath);
    return;
  }

  const bot = await medplum.readResource<Bot>('Bot', botId);
  if (!bot) {
    console.log('Error: Bot does not exist: ' + botId);
    return;
  }

  try {
    console.log('Update bot code.....');
    const result = await medplum.updateResource({
      ...bot,
      code: readFileSync(filePath, 'utf8'),
    });
    console.log('Success! New bot version: ' + result.meta?.versionId);
  } catch (err) {
    console.log('Update error: ', err);
  }
}

if (require.main === module) {
  dotenv.config();
  const medplum = new MedplumClient({ fetch });
  medplum
    .clientCredentials(process.env['MEDPLUM_CLIENT_ID'] as string, process.env['MEDPLUM_CLIENT_SECRET'] as string)
    .then(() => {
      main(medplum, process.argv).catch((err) => console.error('Unhandled error:', err));
    });
}
