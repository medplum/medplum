import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot, OperationOutcome } from '@medplum/fhirtypes';
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import fetch from 'node-fetch';
import { resolve } from 'path';

interface MedplumConfig {
  readonly bots?: MedplumBotConfig[];
}

interface MedplumBotConfig {
  readonly name: string;
  readonly id: string;
  readonly source: string;
  readonly dist?: string;
}

export async function main(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 3) {
    console.log('Usage: medplum <command>');
    return;
  }

  const command = argv[2];
  if (command === 'save-bot') {
    await runBotCommands(medplum, argv, ['save']);
  } else if (command === 'deploy-bot') {
    await runBotCommands(medplum, argv, ['save', 'deploy']);
  } else {
    console.log(`Unknown command: ${command}`);
  }
}

async function runBotCommands(medplum: MedplumClient, argv: string[], commands: string[]): Promise<void> {
  if (argv.length < 4) {
    console.log(`Usage: medplum ${argv[2]} <bot-name>`);
    return;
  }

  const botName = argv[3];
  const botConfig = readBotConfig(botName);
  if (!botConfig) {
    console.log(`Error: ${botName} not found`);
    return;
  }

  let bot;
  try {
    bot = await medplum.readResource('Bot', botConfig.id);
  } catch (err) {
    console.log('Error: ' + normalizeErrorString(err));
    return;
  }

  if (commands.includes('save')) {
    await saveBot(medplum, botConfig, bot);
  }

  if (commands.includes('deploy')) {
    await deployBot(medplum, botConfig, bot);
  }
}

async function saveBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
  const code = readFileContents(botConfig.source);
  if (!code) {
    return;
  }

  try {
    console.log('Update bot code.....');
    const updateResult = await medplum.updateResource({
      ...bot,
      code,
    });
    if (!updateResult) {
      console.log('Bot not modified');
    } else {
      console.log('Success! New bot version: ' + updateResult.meta?.versionId);
    }
  } catch (err) {
    console.log('Update error: ', err);
  }
}

async function deployBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
  const code = readFileContents(botConfig.dist ?? botConfig.source);
  if (!code) {
    return;
  }

  try {
    console.log('Deploying bot...');
    const deployResult = (await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), {
      code,
    })) as OperationOutcome;
    console.log('Deploy result: ' + deployResult.issue?.[0]?.details?.text);
  } catch (err) {
    console.log('Deploy error: ', err);
  }
}

function readBotConfig(botName: string): MedplumBotConfig | undefined {
  return readConfig()?.bots?.find((b) => b.name === botName);
}

function readConfig(): MedplumConfig | undefined {
  const content = readFileContents('medplum.config.json');
  if (!content) {
    return undefined;
  }
  return JSON.parse(content);
}

function readFileContents(fileName: string): string | undefined {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) {
    console.log('Error: File does not exist: ' + path);
    return '';
  }
  return readFileSync(path, 'utf8');
}

if (require.main === module) {
  dotenv.config();
  const medplum = new MedplumClient({ fetch, baseUrl: process.env['MEDPLUM_BASE_URL'] });
  medplum
    .startClientLogin(process.env['MEDPLUM_CLIENT_ID'] as string, process.env['MEDPLUM_CLIENT_SECRET'] as string)
    .then(() => main(medplum, process.argv))
    .catch((err) => console.error('Unhandled error:', err));
}
