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
import { withConnectionLease } from '../common/lease';
import type { ConnectionLease } from '../common/lease';
import { readProjectCeiling } from '../common/configuration';
import { readCredential, MissingCalendarCredentialError } from '../common/credentials';
import { findConnection, saveConnection } from '../common/connection';
import { exchangeCode, revokeToken, getOAuthClient, hasImportScopes, readIdToken } from '../common/google-oauth';
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

  const prior = await findConnection(medplum, practitionerRef);
  const connect = async (lease?: ConnectionLease): Promise<Parameters> => {
    const tokens = await exchangeCode(getOAuthClient(event.secrets), { code, codeVerifier, redirectUri });
    try {
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

      const ceiling = await readProjectCeiling(medplum);
      const connection = await saveConnection(
        medplum,
        {
          practitionerRef,
          accountSub: account.sub,
          accountEmail: account.email,
          refreshToken: tokens.refresh_token,
          eventDetailLevel: eventDetailLevel ?? existing?.eventDetailLevel,
        },
        ceiling,
        lease
      );

      return mutationStatus(connection, ceiling);
    } catch (err) {
      // Do not revoke a grant that a partially successful save already made durable.
      const current = await findConnection(medplum, practitionerRef);
      let persisted = false;
      let storedCredentialExists = false;
      if (current) {
        try {
          persisted = (await readCredential(medplum, current)) === tokens.refresh_token;
          storedCredentialExists = true;
        } catch (readError) {
          if (!(readError instanceof MissingCalendarCredentialError)) {
            throw err;
          }
        } // An unreadable store is not evidence that the grant is unused.
      }
      // Revocation may invalidate other tokens for the same client/account. Do not revoke
      // automatically when this practitioner already has a stored grant.
      if (!persisted && storedCredentialExists) {
        throw new Error(
          'Google reconnect failed; existing credentials were preserved. Use explicit disconnect before switching accounts. Remove application access in Google only if you intend to revoke all grants, then reconnect'
        );
      }
      if (!persisted && (tokens.refresh_token || tokens.access_token)) {
        try {
          await revokeToken(tokens.refresh_token ?? tokens.access_token);
        } catch {
          throw new Error(
            'Google connection failed and the unused grant could not be revoked; remove application access in Google before retrying'
          );
        }
      }
      throw err;
    }
  };
  return prior ? withConnectionLease(medplum, prior.basic.id, connect) : connect();
}

export const handler = operationHandler('connect', execute);
