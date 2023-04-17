import { getDisplayString, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot, OperationOutcome } from '@medplum/fhirtypes';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFile } from 'fs';
import { createServer } from 'http';
import fetch from 'node-fetch';
import { platform } from 'os';
import { resolve } from 'path';
import { FileSystemStorage } from './storage';
import { get } from './get';

interface MedplumConfig {
  readonly bots?: MedplumBotConfig[];
}

interface MedplumBotConfig {
  readonly name: string;
  readonly id: string;
  readonly source: string;
  readonly dist?: string;
}

const clientId = 'medplum-cli';
const redirectUri = 'http://localhost:9615';

export async function main(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 3) {
    console.log('Usage: medplum <command>');
    return;
  }

  // Legacy support for MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET environment variables
  const clientId = process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = process.env['MEDPLUM_CLIENT_SECRET'];
  if (clientId && clientSecret) {
    await medplum.startClientLogin(clientId, clientSecret);
  }

  try {
    const command = argv[2].toLowerCase();
    switch (command) {
      //
      // Auth commands
      //
      case 'login':
        await startLogin(medplum);
        break;
      case 'whoami':
        printMe(medplum);
        break;
      //
      // REST commands
      //
      case 'delete':
        prettyPrint(await medplum.delete(cleanUrl(argv[3])));
        break;
      case 'get':
        await get(medplum, argv);
        break;
      case 'patch':
        prettyPrint(await medplum.patch(cleanUrl(argv[3]), parseBody(argv[4])));
        break;
      case 'post':
        prettyPrint(await medplum.post(cleanUrl(argv[3]), parseBody(argv[4])));
        break;
      case 'put':
        prettyPrint(await medplum.put(cleanUrl(argv[3]), parseBody(argv[4])));
        break;
      //
      // Bot commands
      //
      case 'save-bot':
        await runBotCommands(medplum, argv, ['save']);
        break;
      case 'deploy-bot':
        await runBotCommands(medplum, argv, ['save', 'deploy']);
        break;
      case 'create-bot':
        await createBot(medplum, argv);
        break;
      default:
        console.log(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error('Error: ' + normalizeErrorString(err));
  }
}

async function startLogin(medplum: MedplumClient): Promise<void> {
  await startWebServer(medplum);

  const loginUrl = new URL('/oauth2/authorize', medplum.getBaseUrl());
  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('scope', 'openid');
  loginUrl.searchParams.set('response_type', 'code');
  await openBrowser(loginUrl.toString());
}

async function startWebServer(medplum: MedplumClient): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url as string, 'http://localhost:9615');
    const code = url.searchParams.get('code');
    if (url.pathname === '/' && code) {
      try {
        const profile = await medplum.processCode(code, { clientId, redirectUri });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Signed in as ${getDisplayString(profile)}. You may close this window.`);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Error: ${normalizeErrorString(err)}`);
      } finally {
        server.close();
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }).listen(9615);
}

/**
 * Opens a web browser to the specified URL.
 * See: https://hasinthaindrajee.medium.com/browser-sso-for-cli-applications-b0be743fa656
 * @param url The URL to open.
 */
async function openBrowser(url: string): Promise<void> {
  const os = platform();
  let cmd = undefined;
  switch (os) {
    case 'openbsd':
    case 'linux':
      cmd = `xdg-open '${url}'`;
      break;
    case 'darwin':
      cmd = `open '${url}'`;
      break;
    case 'win32':
      cmd = `cmd /c start "" "${url}"`;
      break;
    default:
      throw new Error('Unsupported platform: ' + os);
  }
  exec(cmd);
}

/**
 * Prints the current user and project.
 * @param medplum The Medplum client.
 */
function printMe(medplum: MedplumClient): void {
  const loginState = medplum.getActiveLogin();
  if (loginState) {
    console.log(`Server:  ${medplum.getBaseUrl()}`);
    console.log(`Profile: ${loginState.profile?.display} (${loginState.profile?.reference})`);
    console.log(`Project: ${loginState.project?.display} (${loginState.project?.reference})`);
  } else {
    console.log('Not logged in');
  }
}

export function cleanUrl(input: string): string {
  const knownPrefixes = ['admin/', 'auth/', 'fhir/R4'];
  if (knownPrefixes.some((p) => input.startsWith(p))) {
    // If the URL starts with a known prefix, return it as-is
    return input;
  }
  // Otherwise, default to FHIR
  return 'fhir/R4/' + input;
}

function parseBody(input: string | undefined): any {
  if (!input) {
    return undefined;
  }
  try {
    return JSON.parse(input);
  } catch (err) {
    return input;
  }
}

export function prettyPrint(input: unknown): void {
  console.log(JSON.stringify(input, null, 2));
}

async function runBotCommands(medplum: MedplumClient, argv: string[], commands: string[]): Promise<void> {
  if (argv.length < 4) {
    console.log(`Usage: medplum ${argv[2]} <bot-name>`);
    return;
  }

  const botName = argv[3];

  const botConfigs = readBotConfigs(botName);
  if (botConfigs.length === 0) {
    console.log(`Error: ${botName} not found`);
    return;
  }

  for (const botConfig of botConfigs) {
    await runBotConfig(botConfig, medplum, argv, commands);
  }

  console.log(`Number of bots deployed: ${botConfigs.length}`);
}

async function runBotConfig(
  botConfig: MedplumBotConfig,
  medplum: MedplumClient,
  argv: string[],
  commands: string[]
): Promise<void> {
  let bot;
  try {
    bot = await medplum.readResource('Bot', botConfig.id);
    console.log(`Initialized Bot -> ${bot.name}...`);
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

export async function createBot(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length < 7) {
    console.log(`Error: command needs to be npx medplum <new-bot-name> <project-id> <source-file> <dist-file>`);
    return;
  }
  const botName = argv[3];
  const projectId = argv[4];
  const sourceFile = argv[5];
  const distFile = argv[6];

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
    console.log('Error while creating new bot ', err);
  }
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

function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
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

if (require.main === module) {
  dotenv.config();
  const baseUrl = process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
  const medplum = new MedplumClient({ fetch, baseUrl, storage: new FileSystemStorage() });
  main(medplum, process.argv).catch((err) => console.error('Unhandled error:', err));
}
