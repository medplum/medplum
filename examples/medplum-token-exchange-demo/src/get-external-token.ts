// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { config as loadEnv } from 'dotenv';
import { exec } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { URL } from 'node:url';

loadEnv();

interface IdpConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  prompt?: string;
}

function getIdpConfig(): IdpConfig {
  const authorizeUrl = process.env.IDP_AUTHORIZE_URL;
  const tokenUrl = process.env.IDP_TOKEN_URL;
  const clientId = process.env.IDP_CLIENT_ID;
  if (!authorizeUrl || !tokenUrl || !clientId) {
    throw new Error('Missing IDP_AUTHORIZE_URL, IDP_TOKEN_URL, or IDP_CLIENT_ID. See README.md / .env.defaults.');
  }
  return {
    authorizeUrl,
    tokenUrl,
    clientId,
    clientSecret: process.env.IDP_CLIENT_SECRET || undefined,
    redirectUri: process.env.IDP_REDIRECT_URI ?? 'http://localhost:8000/callback',
    scope: process.env.IDP_SCOPE ?? 'openid email profile',
    // Force a fresh login by default so the IdP SSO session is not silently reused.
    // Set IDP_PROMPT to '' to allow the existing session, or 'select_account' to pick a user.
    prompt: process.env.IDP_PROMPT ?? 'login',
  };
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

/**
 * Escapes a value for safe interpolation into an HTML response.
 * @param value - The value to escape.
 * @returns The HTML-escaped string.
 */
function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Abort the local listener if the user never completes the login, so the process does not hang.
const LISTEN_TIMEOUT_MS = 5 * 60 * 1000;

interface Pkce {
  verifier: string;
  challenge: string;
}

function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Opens a URL in the user's default browser (best effort, cross platform).
 * @param url - The URL to open.
 */
function openBrowser(url: string): void {
  let command = 'xdg-open';
  if (process.platform === 'darwin') {
    command = 'open';
  } else if (process.platform === 'win32') {
    command = 'start ""';
  }
  exec(`${command} "${url}"`, (err) => {
    if (err) {
      console.log('Could not open a browser automatically. Open this URL manually:\n', url);
    }
  });
}

/**
 * Exchanges an authorization code for tokens at the IdP token endpoint.
 * Supports both confidential clients (client secret) and public clients (PKCE only).
 * @param config - The IdP configuration.
 * @param code - The authorization code from the redirect.
 * @param pkce - The PKCE pair used for this request.
 * @returns The IdP access token.
 */
async function exchangeCodeForToken(config: IdpConfig, code: string, pkce: Pkce): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    // This request goes directly to the external IdP, so this is the IdP application's own OAuth
    // client ID (IDP_CLIENT_ID) - unrelated to the Medplum-side MEDPLUM_AUTH_PROVIDER_ID selector.
    client_id: config.clientId,
    code,
    code_verifier: pkce.verifier,
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  const json = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(`Token request failed: ${json.error ?? response.status} - ${json.error_description ?? ''}`);
  }
  return json.access_token;
}

/**
 * Writes (or replaces) a key in the local .env file.
 * @param key - The env var name.
 * @param value - The value to write.
 */
function updateEnvFile(key: string, value: string): void {
  const envPath = new URL('../.env', import.meta.url);
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    contents = '';
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, contents);
}

async function main(): Promise<void> {
  const config = getIdpConfig();
  const state = randomUUID();
  const pkce = createPkce();
  const redirect = new URL(config.redirectUri);
  const port = Number(redirect.port || 80);

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', config.scope);
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  if (config.prompt) {
    authorizeUrl.searchParams.set('prompt', config.prompt);
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url?.startsWith(redirect.pathname)) {
        res.writeHead(404).end();
        return;
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      const fail = (status: number, heading: string, err: Error): void => {
        res.writeHead(status, { 'Content-Type': 'text/html' }).end(`<h1>${escapeHtml(heading)}</h1>`);
        finish();
        reject(err);
      };

      if (error) {
        const description = url.searchParams.get('error_description');
        fail(400, `IdP error: ${error}`, new Error(`IdP returned error: ${error} - ${description ?? ''}`));
        return;
      }
      if (!code || returnedState !== state) {
        fail(400, 'Missing code or state mismatch', new Error('Missing authorization code or state mismatch.'));
        return;
      }

      exchangeCodeForToken(config, code, pkce)
        .then((token) => {
          res
            .writeHead(200, { 'Content-Type': 'text/html' })
            .end('<h1>Success!</h1><p>Access token captured. You can close this tab and return to the terminal.</p>');
          finish();
          resolve(token);
        })
        .catch((err) => {
          res
            .writeHead(500, { 'Content-Type': 'text/html' })
            .end(`<h1>Token request failed</h1><pre>${escapeHtml(err)}</pre>`);
          finish();
          reject(err);
        });
    });

    const timeout = setTimeout(() => {
      finish();
      reject(new Error(`Timed out after ${LISTEN_TIMEOUT_MS / 1000}s waiting for the IdP redirect.`));
    }, LISTEN_TIMEOUT_MS);
    timeout.unref();

    function finish(): void {
      clearTimeout(timeout);
      server.close();
    }

    server.listen(port, () => {
      console.log(`Listening for the IdP redirect on ${config.redirectUri}`);
      console.log('Opening the IdP login page in your browser...');
      console.log('If it does not open, visit:\n', authorizeUrl.toString());
      openBrowser(authorizeUrl.toString());
    });
    server.on('error', (err) => {
      finish();
      reject(err);
    });
  });

  updateEnvFile('EXTERNAL_ACCESS_TOKEN', accessToken);
  console.log('\nAccess token captured and written to .env as EXTERNAL_ACCESS_TOKEN.');
  console.log('Token (truncated):', `${accessToken.slice(0, 24)}...`);
  console.log('\nNow run:  npm run exchange-for-medplum-token');
}

main().catch((err) => {
  console.error('\nFailed to obtain external IdP token:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
