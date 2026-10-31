// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Connects the signed-in practitioner's Google Calendar from a developer machine, standing in
 * for the customer app's callback page. Runs the consent flow on a loopback port, then calls
 * `Practitioner/$google-calendar-connect` with the code, so the Bot does the exchange and
 * stores the connection. Needs a Desktop-type OAuth client (loopback redirects) and a Medplum
 * session: `MEDPLUM_ACCESS_TOKEN`, or the `medplum login` profile in ~/.medplum.
 *
 *   GOOGLE_CLIENT_ID=… npx tsx src/scripts/connect-local.ts [eventDetailLevel]
 */

import { MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_METADATA_SCOPE } from '../common/constants';

const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';

function loadAccessToken(): string {
  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    return process.env.MEDPLUM_ACCESS_TOKEN;
  }
  const profile = process.env.MEDPLUM_PROFILE ?? 'default';
  const stored = JSON.parse(readFileSync(join(homedir(), '.medplum', `${profile}.json`), 'utf8')) as {
    logins?: string;
  };
  const logins = JSON.parse(stored.logins ?? '[]') as { accessToken?: string }[];
  const token = logins[0]?.accessToken;
  if (!token) {
    throw new Error('Not logged in: run `npx medplum login` or set MEDPLUM_ACCESS_TOKEN');
  }
  return token;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

async function authorize(clientId: string): Promise<{ code: string; codeVerifier: string }> {
  const codeVerifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: `openid email ${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_CALENDAR_METADATA_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const incoming = new URL(req.url ?? '/', REDIRECT_URI);
      if (incoming.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = incoming.searchParams.get('error');
      const received = incoming.searchParams.get('code');
      if (error || !received || incoming.searchParams.get('state') !== state) {
        res.writeHead(400).end(`Authorization failed: ${error ?? 'bad state or no code'}`);
        server.close();
        reject(new Error(error ?? 'bad state or no code'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Authorized. You can close this tab.');
      server.close();
      resolve(received);
    });
    server.listen(PORT, () => {
      console.log(`\nOpen this URL in a browser signed in to the Google account to connect:\n\n${url.toString()}\n`);
    });
  });
  return { code, codeVerifier };
}

async function main(): Promise<void> {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const eventDetailLevel = process.argv[2];
  const medplum = new MedplumClient({ baseUrl: BASE_URL, accessToken: loadAccessToken() });
  const profile = await medplum.getProfileAsync();
  console.log(`Connecting ${profile?.resourceType}/${profile?.id} on ${BASE_URL}`);

  const { code, codeVerifier } = await authorize(clientId);
  const parameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'code', valueString: code },
      { name: 'codeVerifier', valueString: codeVerifier },
      { name: 'redirectUri', valueString: REDIRECT_URI },
      ...(eventDetailLevel ? [{ name: 'eventDetailLevel', valueString: eventDetailLevel }] : []),
    ],
  };
  const result = await medplum.post(medplum.fhirUrl('Practitioner', '$google-calendar-connect'), parameters);
  console.log('connect:', JSON.stringify(result, null, 2));

  const status = await medplum.post(medplum.fhirUrl('Practitioner', '$google-calendar-status'), {
    resourceType: 'Parameters',
  } satisfies Parameters);
  console.log('status:', JSON.stringify(status as Parameters | OperationOutcome, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
