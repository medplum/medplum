import { MEDPLUM_VERSION, normalizeErrorString } from '@medplum/core';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { login, whoami } from './auth';
import { aws } from './aws/index';
import { bot, createBotDeprecate, deployBotDeprecate, saveBotDeprecate } from './bots';
import { bulk } from './bulk';
import { hl7 } from './hl7';
import { profile } from './profiles';
import { project } from './project';
import { deleteObject, get, patch, post, put } from './rest';

export async function main(argv: string[]): Promise<void> {
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

    // Bulk Commands
    index.addCommand(bulk);

    // Bot Commands
    index.addCommand(bot);

    // Deprecated Bot Commands
    index.addCommand(saveBotDeprecate);
    index.addCommand(deployBotDeprecate);
    index.addCommand(createBotDeprecate);

    // Profile Commands
    index.addCommand(profile);

    // AWS commands
    index.addCommand(aws);

    // HL7 commands
    index.addCommand(hl7);

    await index.parseAsync(argv);
  } catch (err) {
    console.error('Error: ' + normalizeErrorString(err));
  }
}

export async function run(): Promise<void> {
  dotenv.config();
  await main(process.argv);
}

if (require.main === module) {
  run().catch((err) => console.error('Unhandled error:', err));
}
