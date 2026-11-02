// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Connects the signed-in practitioner's Google Calendar from a developer machine, standing in
 * for the customer app's callback page. Runs the consent flow on a loopback port, then calls
 * `Practitioner/$google-calendar-connect` with the code, so the Bot does the exchange and
 * stores the connection. Needs a Desktop-type OAuth client (loopback redirects) and a Medplum
 * session: `MEDPLUM_ACCESS_TOKEN`, or the selected `medplum login` profile. PROJECT_ID must match the authenticated project.
 *
 *   PROJECT_ID=… GOOGLE_CALENDAR_CLIENT_ID=… npx tsx src/scripts/connect-local.ts [eventDetailLevel]
 */

import { MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { GOOGLE_CALENDAR_METADATA_SCOPE, GOOGLE_CALENDAR_SCOPE } from '../common/constants';
import { assertDeploymentProject, cliAccessToken } from './deployment-auth';

const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const BASE_URL = process.env.BASE_URL ?? process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';

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
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`\nOpen this URL in a browser signed in to the Google account to connect:\n\n${url.toString()}\n`);
    });
  });
  return { code, codeVerifier };
}

async function main(): Promise<void> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? requireEnv('GOOGLE_CLIENT_ID');
  const eventDetailLevel = process.argv[2];
  const medplum = new MedplumClient({
    baseUrl: BASE_URL,
    accessToken: process.env.MEDPLUM_ACCESS_TOKEN ?? cliAccessToken(BASE_URL, process.env.MEDPLUM_PROFILE),
  });
  await assertDeploymentProject(medplum, requireEnv('PROJECT_ID'));
  const profile = await medplum.getProfileAsync();
  if (profile?.resourceType !== 'Practitioner') {
    throw new Error('Use a practitioner login to connect Google');
  }
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
  console.error(err instanceof Error ? err.message : 'Google connection failed');
  process.exit(1);
});
