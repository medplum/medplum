import { MedplumClient } from '@medplum/core';
import { Bot, Extension, OperationOutcome } from '@medplum/fhirtypes';
import { existsSync, readFileSync, writeFile } from 'fs';
import { resolve } from 'path';
import internal from 'stream';
import tar from 'tar';
import { FileSystemStorage } from './storage';

interface MedplumConfig {
  readonly baseUrl?: string;
  readonly clientId?: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey?: string;
  readonly registerEnabled?: boolean;
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

export function readConfig(tagName?: string): MedplumConfig | undefined {
  const fileName = tagName ? `medplum.${tagName}.config.json` : 'medplum.config.json';
  const content = readFileContents(fileName);
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

/**
 * Creates a safe tar extractor that limits the number of files and total size.
 *
 * Expanding archive files without controlling resource consumption is security-sensitive
 *
 * See: https://sonarcloud.io/organizations/medplum/rules?open=typescript%3AS5042&rule_key=typescript%3AS5042
 * @param destinationDir The destination directory where all files will be extracted.
 * @returns A tar file extractor.
 */
export function safeTarExtractor(destinationDir: string): internal.Writable {
  const MAX_FILES = 100;
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  let fileCount = 0;
  let totalSize = 0;

  return tar.x({
    cwd: destinationDir,
    filter: (_path, entry) => {
      fileCount++;
      if (fileCount > MAX_FILES) {
        throw new Error('Tar extractor reached max number of files');
      }

      totalSize += entry.size;
      if (totalSize > MAX_SIZE) {
        throw new Error('Tar extractor reached max size');
      }

      return true;
    },
  });
}

export function getUnsupportedExtension(): Extension {
  return {
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
        valueCode: 'unsupported',
      },
    ],
  };
}

export function checkIfProfileExists(options: any): boolean {
  if (options.profile) {
    const storage = new FileSystemStorage(options.profile);
    const optionsObject = storage.getObject('options');
    if (!optionsObject) {
      console.log(`Profile ${options.profile} does not exist`);
      return false;
    }
  }
  return true;
}
