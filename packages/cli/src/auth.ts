// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { LoginState, MedplumClient } from '@medplum/core';
import {
  ClientStorage,
  ContentType,
  getDisplayString,
  MEDPLUM_CLI_CLIENT_ID,
  MemoryStorage,
  normalizeErrorString,
} from '@medplum/core';
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';
import type { Profile } from './utils';
import { jwtAssertionLogin, jwtBearerLogin, MedplumCommand, saveProfile } from './utils';

const execAsync = promisify(exec);

const clientId = MEDPLUM_CLI_CLIENT_ID;
const redirectUri = 'http://localhost:9615';

export const login = new MedplumCommand('login');
export const logout = new MedplumCommand('logout');
export const whoami = new MedplumCommand('whoami');
export const token = new MedplumCommand('token');

login.action(async (options) => {
  const profileName = options.profile ?? 'default';

  // Always save the profile to update settings
  const profile = saveProfile(profileName, options);

  const medplum = await createMedplumClient(options, false);
  await startLogin(medplum, profile);
});

logout.action(async (options) => {
  const storage = new FileSystemStorage(options.profile ?? 'default');
  const logins = storage.getObject<LoginState[]>('logins') ?? [];
  if (logins.length === 0) {
    console.log('Not logged in');
    return;
  }

  // Revoke through an in-memory client: a rejected token makes MedplumClient clear its storage,
  // which would otherwise erase the saved profile settings along with the tokens.
  let rejected = false;
  const medplum = await createMedplumClient(
    {
      ...options,
      storage: new ClientStorage(new MemoryStorage()),
      onUnauthenticated: () => {
        rejected = true;
      },
    },
    false
  );

  const errors: Error[] = [];
  for (const login of logins) {
    const display = `${login.profile.display} (${login.profile.reference})`;
    rejected = false;
    try {
      medplum.setAccessToken(login.accessToken, login.refreshToken);
      await medplum.signOut();
      console.log(`Revoked session: ${display}`);
    } catch (err) {
      if (rejected) {
        console.log(`Session already invalid: ${display}`);
      } else {
        errors.push(new Error(`Failed to revoke session ${display}: ${normalizeErrorString(err)}`));
      }
    }
  }

  if (errors.length > 0) {
    // Keep the stored tokens so the user can retry
    throw new Error('Logout failed; stored credentials were kept', { cause: errors });
  }

  storage.setObject('activeLogin', undefined);
  storage.setObject('logins', undefined);
  console.log('Logged out');
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
  console.log(token);
});

async function startLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  const authType = profile?.authType ?? 'authorization-code';
  switch (authType) {
    case 'authorization-code':
      await medplumAuthorizationCodeLogin(medplum, profile);
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
        process.exit(0);
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
  await execAsync(cmd);
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

async function medplumAuthorizationCodeLogin(medplum: MedplumClient, profile: Profile): Promise<void> {
  await startWebServer(medplum);
  const loginUrl = new URL(medplum.getAuthorizeUrl());
  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('scope', profile.scope ?? 'openid offline_access');
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('prompt', 'login');
  await openBrowser(loginUrl.toString());
}
