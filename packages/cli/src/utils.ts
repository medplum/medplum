import { ContentType, encodeBase64, MedplumClient } from '@medplum/core';
import { Bot, Extension, OperationOutcome } from '@medplum/fhirtypes';
import { createHmac, createPrivateKey, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { SignJWT } from 'jose';
import { basename, extname, resolve } from 'path';
import internal from 'stream';
import tar from 'tar';
import { FileSystemStorage } from './storage';

interface MedplumConfig {
  baseUrl?: string;
  clientId?: string;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  registerEnabled?: boolean;
  bots?: MedplumBotConfig[];
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
      filename: basename(codePath),
    })) as OperationOutcome;
    console.log('Deploy result: ' + deployResult.issue?.[0]?.details?.text);
  } catch (err) {
    console.log('Deploy error: ', err);
  }
}

export async function createBot(
  medplum: MedplumClient,
  botName: string,
  projectId: string,
  sourceFile: string,
  distFile: string,
  runtimeVersion?: string
): Promise<void> {
  try {
    const body = {
      name: botName,
      description: '',
      runtimeVersion,
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
    await deployBot(medplum, botConfig as MedplumBotConfig, bot);
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

function readFileContents(fileName: string): string {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf8');
}

function addBotToConfig(botConfig: MedplumBotConfig): void {
  const config = readConfig() ?? {};
  if (!config.bots) {
    config.bots = [];
  }
  config.bots.push(botConfig);
  writeFileSync('medplum.config.json', JSON.stringify(config, null, 2), 'utf8');
  console.log(`Bot added to config: ${botConfig.id}`);
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
 * @param destinationDir - The destination directory where all files will be extracted.
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

export function saveProfile(profileName: string, options: Profile): Profile {
  const storage = new FileSystemStorage(profileName);
  const optionsObject = { name: profileName, ...options };
  storage.setObject('options', optionsObject);
  console.log(`${profileName} profile created`);
  return optionsObject;
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

export async function jwtBearerLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  const header = {
    typ: 'JWT',
    alg: 'HS256',
  };

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const data = {
    aud: `${profile.baseUrl}${profile.audience}`,
    iss: profile.issuer,
    sub: profile.subject,
    nbf: currentTimestamp,
    iat: currentTimestamp,
    exp: currentTimestamp + 604800, // expiry time is 7 days from time of creation
  };
  const encodedHeader = encodeBase64(JSON.stringify(header));
  const encodedData = encodeBase64(JSON.stringify(data));
  const token = `${encodedHeader}.${encodedData}`;
  const signature = createHmac('sha256', profile.clientSecret as string)
    .update(token)
    .digest('base64url');
  const signedToken = `${token}.${signature}`;
  await medplum.startJwtBearerLogin(profile.clientId as string, signedToken, profile.scope ?? '');
}

export async function jwtAssertionLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  const privateKey = createPrivateKey(readFileSync(resolve(profile.privateKeyPath as string)));
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS384', typ: 'JWT' })
    .setIssuer(profile.clientId as string)
    .setSubject(profile.clientId as string)
    .setAudience(`${profile.baseUrl}${profile.audience}`)
    .setJti(randomBytes(16).toString('hex'))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  await medplum.startJwtAssertionLogin(jwt);
}
