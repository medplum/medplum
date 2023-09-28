import { ContentType, getDisplayString, MedplumClient, normalizeErrorString } from '@medplum/core';
import { exec } from 'child_process';
import { createServer } from 'http';
import { platform } from 'os';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { jwtAssertionLogin, jwtBearerLogin, loadProfile, Profile, saveProfile } from './utils';

const clientId = 'medplum-cli';
const redirectUri = 'http://localhost:9615';

export const login = createMedplumCommand('login');
export const whoami = createMedplumCommand('whoami');

login.action(async (options) => {
  const profileName = options.profile ?? 'default';

  // Always save the profile to update settings
  saveProfile(profileName, options);

  if (options.authType === 'basic') {
    console.log('Basic authentication does not require login');
    return;
  }

  // Reload the profile to get merged settings
  const profile = loadProfile(profileName);
  const medplum = await createMedplumClient(options, false);
  await startLogin(medplum, profile);
});

whoami.action(async (options) => {
  const medplum = await createMedplumClient(options);
  printMe(medplum);
});

async function startLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  const authType = profile?.authType ?? 'authorization_code';
  switch (authType) {
    case 'authorization-code':
    case 'authorization_code':
      await medplumAuthorizationCodeLogin(medplum);
      break;
    case 'basic':
      medplum.setBasicAuth(profile.clientId as string, profile.clientSecret as string);
      break;
    case 'client-credentials':
    case 'client_credentials':
      medplum.setBasicAuth(profile.clientId as string, profile.clientSecret as string);
      await medplum.startClientLogin(profile.clientId as string, profile.clientSecret as string);
      break;
    case 'jwt-bearer':
    case 'jwt_bearer':
      await jwtBearerLogin(medplum, profile);
      break;
    case 'jwt-assertion':
    case 'jwt_assertion':
      await jwtAssertionLogin(medplum, profile);
      break;
    default:
      throw new Error(`Unsupported auth type: ${authType}`);
  }

  console.log('Login successful');
}

async function startWebServer(medplum: MedplumClient): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url as string, 'http://localhost:9615');
    const code = url.searchParams.get('code');
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
