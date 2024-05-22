import {
  ContentType,
  getDisplayString,
  MEDPLUM_CLI_CLIENT_ID,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { platform } from 'node:os';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { jwtAssertionLogin, jwtBearerLogin, Profile, saveProfile } from './utils';

const clientId = MEDPLUM_CLI_CLIENT_ID;
const redirectUri = 'http://localhost:9615';

export const login = createMedplumCommand('login');
export const whoami = createMedplumCommand('whoami');
export const token = createMedplumCommand('token');

login.action(async (options) => {
  const profileName = options.profile ?? 'default';

  // Always save the profile to update settings
  const profile = saveProfile(profileName, options);

  const medplum = await createMedplumClient(options, false);
  await startLogin(medplum, profile);
});

whoami.action(async (options) => {
  const medplum = await createMedplumClient(options);
  printMe(medplum);
});

token.action(async (options) => {
  const medplum = await createMedplumClient(options);
  await medplum.getProfileAsync();
  const token = medplum.getAccessToken();
  if (!token) {
    throw new Error('Not logged in');
  }
  console.log('Access token:');
  console.log();
  console.log(token);
});

async function startLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  const authType = profile?.authType ?? 'authorization-code';
  switch (authType) {
    case 'authorization-code':
      await medplumAuthorizationCodeLogin(medplum);
      break;
    case 'basic':
      medplum.setBasicAuth(profile.clientId as string, profile.clientSecret as string);
      break;
    case 'client-credentials':
      medplum.setBasicAuth(profile.clientId as string, profile.clientSecret as string);
      await medplum.startClientLogin(profile.clientId as string, profile.clientSecret as string);
      break;
    case 'jwt-bearer':
      await jwtBearerLogin(medplum, profile);
      break;
    case 'jwt-assertion':
      await jwtAssertionLogin(medplum, profile);
      break;
  }
}

async function startWebServer(medplum: MedplumClient): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url as string, 'http://localhost:9615');
    const code = url.searchParams.get('code');
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        Allow: 'GET, POST',
        'Content-Type': ContentType.TEXT,
      });
      res.end('OK');
      return;
    }
    if (url.pathname === '/' && code) {
      try {
        const profile = await medplum.processCode(code, { clientId, redirectUri });
        res.writeHead(200, { 'Content-Type': ContentType.TEXT });
        res.end(`Signed in as ${getDisplayString(profile)}. You may close this window.`);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': ContentType.TEXT });
        res.end(`Error: ${normalizeErrorString(err)}`);
      } finally {
        server.close();
      }
    } else {
      res.writeHead(404, { 'Content-Type': ContentType.TEXT });
      res.end('Not found');
    }
  }).listen(9615);
}

/**
 * Opens a web browser to the specified URL.
 * See: https://hasinthaindrajee.medium.com/browser-sso-for-cli-applications-b0be743fa656
 * @param url - The URL to open.
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
  exec(cmd, (error, _, stderr) => {
    if (error) {
      throw error;
    }
    if (stderr) {
      throw new Error('Could not open browser: ' + stderr);
    }
  });
}

/**
 * Prints the current user and project.
 * @param medplum - The Medplum client.
 */
function printMe(medplum: MedplumClient): void {
  const loginState = medplum.getActiveLogin();
  if (loginState) {
    console.log(`Server:  ${medplum.getBaseUrl()}`);
    console.log(`Profile: ${loginState.profile.display} (${loginState.profile.reference})`);
    console.log(`Project: ${loginState.project.display} (${loginState.project.reference})`);
  } else {
    console.log('Not logged in');
  }
}

async function medplumAuthorizationCodeLogin(medplum: MedplumClient): Promise<void> {
  await startWebServer(medplum);
  const loginUrl = new URL(medplum.getAuthorizeUrl());
  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('scope', 'openid');
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('prompt', 'login');
  await openBrowser(loginUrl.toString());
}
