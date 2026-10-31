// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { operationHandler } from '../common/contracts';

/*
 * `Practitioner/$google-calendar-connect`. The callback page in the customer's app has
 * already checked `state`; it sends the authorization code and PKCE verifier here. Runs under
 * its restricted Bot membership; event.requester identifies the practitioner.
 */

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_METADATA_SCOPE, BOT_IDENTIFIER_VALUE } from '../common/constants';
import { findConnection, saveConnection } from '../common/connection';
import { exchangeCode, getOAuthClient, hasImportScopes, readIdToken } from '../common/google-oauth';
import { requireOperationBot } from '../common/authorization';
import { mutationStatus, getParam, parseDetailLevel } from '../common/operations';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitionerRef = await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.connect);
  const code = getParam(event.input, 'code');
  const codeVerifier = getParam(event.input, 'codeVerifier');
  const redirectUri = getParam(event.input, 'redirectUri');
  if (!code || !codeVerifier || !redirectUri) {
    throw new Error('Required parameters missing: code, codeVerifier and redirectUri');
  }
  const eventDetailLevel = parseDetailLevel(getParam(event.input, 'eventDetailLevel'));

  const tokens = await exchangeCode(getOAuthClient(event.secrets), { code, codeVerifier, redirectUri });
  if (!tokens.refresh_token) {
    throw new Error('Google returned no refresh token; authorize with access_type=offline and prompt=consent');
  }
  if (!hasImportScopes(tokens.scope)) {
    throw new Error(
      `Google did not grant ${GOOGLE_CALENDAR_SCOPE} and ${GOOGLE_CALENDAR_METADATA_SCOPE}; approve calendar access and try again`
    );
  }
  if (!tokens.id_token) {
    throw new Error('Google returned no id_token; include the openid scope');
  }
  const account = readIdToken(tokens.id_token);

  // Account switching requires a separate, explicit disconnect.
  const existing = await findConnection(medplum, practitionerRef);
  if (existing && existing.accountSub !== account.sub) {
    throw new Error('Disconnect the existing Google account before switching accounts');
  }

  const connection = await saveConnection(medplum, {
    practitionerRef,
    accountSub: account.sub,
    accountEmail: account.email,
    refreshToken: tokens.refresh_token,
    eventDetailLevel: eventDetailLevel ?? existing?.eventDetailLevel,
  });

  return mutationStatus(connection);
}

export const handler = operationHandler('connect', execute);
