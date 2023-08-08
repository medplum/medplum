import { ContentType, MedplumClient } from '@medplum/core';
import { Bot, Extension, OperationOutcome } from '@medplum/fhirtypes';
import { existsSync, readFileSync, writeFile } from 'fs';
import { basename, extname, resolve } from 'path';
import internal from 'stream';
import tar from 'tar';
import { FileSystemStorage } from './storage';
import { SignJWT } from 'jose';
import * as path from 'path';
import fs from 'fs';
import { createPrivateKey, randomBytes } from 'crypto';
import { homedir } from 'os';

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

export interface Profile {
  readonly name?: string;
  readonly authType?: string;
  readonly baseUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly tokenUrl?: string;
  readonly authorizeUrl?: string;
  readonly fhirUrlPath?: string;
  readonly scope?: string;
  readonly accessToken?: string;
  readonly callbackUrl?: string;
  readonly subject?: string;
  readonly audience?: string;
  readonly issuer?: string;
  readonly privateKeyPath?: string;
}

export function prettyPrint(input: unknown): void {
  console.log(JSON.stringify(input, null, 2));
}

export async function saveBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
  const codePath = botConfig.source;
  const code = readFileContents(codePath);
  if (!code) {
    return;
  }

  try {
    console.log('Saving source code...');
    const sourceCode = await medplum.createAttachment(code, basename(codePath), getCodeContentType(codePath));

    console.log('Updating bot.....');
    const updateResult = await medplum.updateResource({
      ...bot,
      sourceCode,
    });
    console.log('Success! New bot version: ' + updateResult.meta?.versionId);
  } catch (err) {
    console.log('Update error: ', err);
  }
}

export async function deployBot(medplum: MedplumClient, botConfig: MedplumBotConfig, bot: Bot): Promise<void> {
  const codePath = botConfig.dist ?? botConfig.source;
  const code = readFileContents(codePath);
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

export function getCodeContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (['.cjs', '.mjs', '.js'].includes(ext)) {
    return ContentType.JAVASCRIPT;
  }
  if (['.cts', '.mts', '.ts'].includes(ext)) {
    return ContentType.TYPESCRIPT;
  }
  return ContentType.TEXT;
}

export function saveProfile(profileName: string, options: Profile): void {
  const storage = new FileSystemStorage(profileName);
  const optionsObject = { name: profileName, ...options };
  storage.setObject('options', optionsObject);
  console.log(`${profileName} profile created`);
}

export function loadProfile(profileName: string): Profile {
  const storage = new FileSystemStorage(profileName);
  return storage.getObject('options') as Profile;
}

export function profileExists(storage: FileSystemStorage, profile: string): boolean {
  if (profile === 'default') {
    return true;
  }
  const optionsObject = storage.getObject('options');
  if (!optionsObject) {
    return false;
  }
  return true;
}

export async function jwtAssertionLogin(externalClient: MedplumClient, profile: Profile): Promise<string> {
  const homeDir = homedir();
  const privateKeyPath = path.join(homeDir, profile.privateKeyPath as string);
  const privateKeyStr = fs.readFileSync(privateKeyPath);
  const privateKey = createPrivateKey(privateKeyStr);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS384', typ: 'JWT' })
    .setIssuer(profile.clientId as string)
    .setSubject(profile.clientId as string)
    .setAudience(`${profile.baseUrl}${profile.audience}`)
    .setJti(randomBytes(16).toString('hex'))
    .setExpirationTime('2h')
    .sign(privateKey);

  const formBody = new URLSearchParams();
  formBody.append('grant_type', 'client_credentials');
  formBody.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  formBody.append('client_assertion', jwt);

  const res = await externalClient.post(
    profile.tokenUrl as string,
    formBody.toString(),
    'application/x-www-form-urlencoded',
    { credentials: 'include' }
  );

  if (res.status !== 200) {
    console.log(res);
    throw new Error(`Failed to login: ${res.status} ${res.statusText}`);
  }
  console.log(res);
  return res.access_token;
}
