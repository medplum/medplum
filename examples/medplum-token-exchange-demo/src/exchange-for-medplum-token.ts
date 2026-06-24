// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, getDisplayString } from '@medplum/core';
import { config as loadEnv } from 'dotenv';

loadEnv();

interface ScriptConfig {
  baseUrl: string;
  clientId: string;
  membershipId?: string;
  externalAccessToken?: string;
  externalTokenUrl?: string;
  externalClientId?: string;
  externalClientSecret?: string;
  externalScope?: string;
}

function getConfig(): ScriptConfig {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing MEDPLUM_CLIENT_ID. See README.md for setup instructions.');
  }

  return {
    baseUrl: process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/',
    clientId,
    membershipId: process.env.MEDPLUM_MEMBERSHIP_ID,
    externalAccessToken: process.env.EXTERNAL_ACCESS_TOKEN,
    externalTokenUrl: process.env.EXTERNAL_TOKEN_URL,
    externalClientId: process.env.EXTERNAL_CLIENT_ID,
    externalClientSecret: process.env.EXTERNAL_CLIENT_SECRET,
    externalScope: process.env.EXTERNAL_SCOPE,
  };
}

/**
 * Obtains an access token from the external identity provider.
 *
 * In a real deployment, this token comes from however your external IdP issues tokens to your
 * service (for example, the access token returned during a sign-in flow). For convenience when
 * testing, this script can fetch one directly using the OAuth2 `client_credentials` grant if you
 * provide the external IdP token endpoint and credentials.
 * @param config - The script configuration.
 * @returns The external access token to exchange.
 */
async function getExternalAccessToken(config: ScriptConfig): Promise<string> {
  if (config.externalAccessToken) {
    return config.externalAccessToken;
  }

  if (!config.externalTokenUrl || !config.externalClientId || !config.externalClientSecret) {
    throw new Error(
      'Provide either EXTERNAL_ACCESS_TOKEN, or EXTERNAL_TOKEN_URL + EXTERNAL_CLIENT_ID + EXTERNAL_CLIENT_SECRET ' +
        'so the script can fetch a token from your external IdP. See README.md.'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.externalClientId,
    client_secret: config.externalClientSecret,
  });
  if (config.externalScope) {
    body.set('scope', config.externalScope);
  }

  const response = await fetch(config.externalTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch external access token (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('External IdP response did not include an access_token.');
  }
  return json.access_token;
}

async function main(): Promise<void> {
  const config = getConfig();
  console.log('Medplum base URL:', config.baseUrl);
  console.log('Client ID (external auth selector):', config.clientId);
  console.log('Membership ID:', config.membershipId ?? '(none - default membership)');

  const externalAccessToken = await getExternalAccessToken(config);
  console.log('Obtained external access token.');

  const medplum = new MedplumClient({ baseUrl: config.baseUrl });

  // Server side token exchange:
  // - `clientId` selects the external auth provider (a server `externalAuthProviders` entry for
  //   self-hosters, or a `ClientApplication` with an `identityProvider` for hosted Medplum).
  // - `membershipId` optionally targets a specific ProjectMembership, allowing the same external
  //   identity to authenticate into a project other than the client's own project.
  const profile = await medplum.exchangeExternalAccessToken(
    externalAccessToken,
    config.clientId,
    config.membershipId
  );

  const login = medplum.getActiveLogin();
  const accessToken = medplum.getAccessToken();

  console.log('\nToken exchange succeeded.');
  console.log('Profile:', `${profile.resourceType}/${profile.id}`, `(${getDisplayString(profile)})`);
  console.log('Project:', login?.project?.reference ?? '(unknown)');
  console.log('Membership:', login?.profile?.reference ?? '(unknown)');
  console.log('Access token (truncated):', accessToken ? `${accessToken.slice(0, 16)}...` : '(none)');
}

main().catch((err) => {
  console.error('\nToken exchange failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
