import { MedplumClient } from '@medplum/core';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFile } from 'fs';
import { Bot, OperationOutcome } from '@medplum/fhirtypes';

interface MedplumConfig {
  readonly bots?: MedplumBotConfig[];
}

interface MedplumBotConfig {
  readonly name: string;
  readonly id: string;
  readonly source: string;
  readonly dist?: string;
}

export function prettyPrint(input: unknown): void {
  console.log(JSON.stringify(input, null, 2));
}

export async function saveBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
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

export async function deployBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
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

export async function createBot(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 4) {
    console.log(`Error: command needs to be npx medplum <new-bot-name> <project-id> <source-file> <dist-file>`);
    return;
  }
  const botName = argv[0];
  const projectId = argv[1];
  const sourceFile = argv[2];
  const distFile = argv[3];

  try {
    const body = {
      name: botName,
      description: '',
    };
    const newBot = await medplum.post('admin/projects/' + projectId + '/bot', body);
    const bot = await medplum.readResource('Bot', newBot.id);

    const botConfig = {
      name: botName,
      id: newBot.id,
      source: sourceFile,
      dist: distFile,
    };
    await saveBot(medplum, botConfig as MedplumBotConfig, bot);
    console.log(`Success! Bot created: ${bot.id}`);

    addBotToConfig(botConfig);
  } catch (err) {
    console.log('Error while creating new bot: ' + err);
  }
}

export function readBotConfigs(botName: string): MedplumBotConfig[] {
  const regExBotName = new RegExp('^' + escapeRegex(botName).replace(/\\\*/g, '.*') + '$');
  const botConfigs = readConfig()?.bots?.filter((b) => regExBotName.test(b.name));
  if (!botConfigs) {
    return [];
  }
  return botConfigs;
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

function addBotToConfig(botConfig: MedplumBotConfig): void {
  const config = readConfig();
  config?.bots?.push(botConfig);
  writeFile('medplum.config.json', JSON.stringify(config), () => {
    console.log(`Bot added to config: ${botConfig.id}`);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
