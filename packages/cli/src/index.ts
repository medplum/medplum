import { MEDPLUM_VERSION, normalizeErrorString } from '@medplum/core';
import { Command, CommanderError } from 'commander';
import dotenv from 'dotenv';
import { login, token, whoami } from './auth';
import { buildAwsCommand } from './aws/index';
import { bot, createBotDeprecate, deployBotDeprecate, saveBotDeprecate } from './bots';
import { bulk } from './bulk';
import { hl7 } from './hl7';
import { profile } from './profiles';
import { project } from './project';
import { deleteObject, get, patch, post, put } from './rest';

export async function main(argv: string[]): Promise<void> {
  const index = new Command('medplum').description('Command to access Medplum CLI');

  index.exitOverride();

  index.version(MEDPLUM_VERSION);

  // Auth commands
  index.addCommand(login);
  index.addCommand(whoami);
  index.addCommand(token);

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
  index.addCommand(buildAwsCommand());

  // HL7 commands
  index.addCommand(hl7);

  try {
    await index.parseAsync(argv);
  } catch (err) {
    handleError(err as Error);
  }
}

export function handleError(err: Error | CommanderError): void {
  writeErrorToStderr(err);
  const cause = err.cause;
  if (Array.isArray(cause)) {
    for (const err of cause as Error[]) {
      writeErrorToStderr(err);
    }
  }
  let exitCode = 1;
  if (err instanceof CommanderError) {
    exitCode = err.exitCode;
  }
  process.exit(exitCode);
}

function writeErrorToStderr(err: unknown): void {
  if (err instanceof CommanderError) {
    process.stderr.write(`${normalizeErrorString(err)}\n`);
  }
  process.stderr.write(`Error: ${normalizeErrorString(err)}\n`);
}

export async function run(): Promise<void> {
  dotenv.config();
  await main(process.argv);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Unhandled error:', normalizeErrorString(err));
    process.exit(1);
  });
}
