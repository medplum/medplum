import { getDisplayString, LoginState, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot, OperationOutcome } from '@medplum/fhirtypes';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import fetch from 'node-fetch';
import { homedir, platform } from 'os';
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

const baseUrl = process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
const clientId = 'medplum-cli';
const redirectUri = 'http://localhost:9615';
const credentialsFileName = resolve(homedir(), '.medplum', 'credentials.json');

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

  // Read credentials from file
  await readCredentials(medplum);

  medplum.addEventListener('change', async () => {
    // On changes (such as refresh), save the credentials to file
    await writeCredentials(medplum);
  });

  const command = argv[2];
  switch (command) {
    case 'login':
      await startLogin(medplum);
      break;
    case 'whoami':
      printMe(medplum);
      break;
    case 'save-bot':
      await runBotCommands(medplum, argv, ['save']);
      break;
    case 'deploy-bot':
      await runBotCommands(medplum, argv, ['save', 'deploy']);
      break;
    default:
      console.log(`Unknown command: ${command}`);
  }
}

async function readCredentials(medplum: MedplumClient): Promise<void> {
  if (existsSync(credentialsFileName)) {
    const loginState = JSON.parse(readFileSync(credentialsFileName, 'utf8'));
    await medplum.setActiveLogin(loginState as LoginState);
  }
}

async function writeCredentials(medplum: MedplumClient): Promise<void> {
  const loginState = medplum.getActiveLogin();
  if (loginState) {
    writeFileSync(credentialsFileName, JSON.stringify(loginState, null, 2), 'utf8');
  }
}

async function startLogin(medplum: MedplumClient): Promise<void> {
  await startWebServer(medplum);

  const loginUrl = new URL('/oauth2/authorize', baseUrl);
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
        await writeCredentials(medplum);
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
      cmd = `xdg-open ${url}`;
      break;
    case 'darwin':
      cmd = `open ${url}`;
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
    console.log(`Profile: ${loginState.profile?.display} (${loginState.profile?.reference})`);
    console.log(`Project: ${loginState.project?.display} (${loginState.project?.reference})`);
  } else {
    console.log('Not logged in');
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
  const medplum = new MedplumClient({ fetch, baseUrl });
  main(medplum, process.argv).catch((err) => console.error('Unhandled error:', err));
}
