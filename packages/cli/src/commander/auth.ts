import { Command } from 'commander';
import { medplum } from '.';
import { MedplumClient, getDisplayString, normalizeErrorString } from '@medplum/core';
import { platform } from 'os';
import { exec } from 'child_process';
import { createServer } from 'http';

const clientId = 'medplum-cli';
const redirectUri = 'http://localhost:9615';

export const login = new Command('login');
export const whoami = new Command('whoami');

login.action(async () => {
  await startLogin(medplum);
});

whoami.action(() => {
  printMe(medplum);
});

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
