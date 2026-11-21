// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue, getIdentifier } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import { GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { GoogleOAuthError } from './google-oauth';
import type { ConnectionLease } from './lease';
import { projectQuery } from './project';
import { ifMatch } from './versioning';

/*
 * The refresh token store: one secret per connection, owned by the practitioner. Workers read
 * the value; the connect Bot writes it and never reads it back. A `Basic` stands in until
 * Medplum has an encrypted secret resource, so the token is not encrypted and the write-only
 * rule is a convention. Only this file and `credentialGrant` in policies.ts know the storage.
 */

export const CREDENTIAL_CRITERIA = `Basic?code=${N}|calendar-credential`;
const TOKEN_URL = `${N}/refresh-token`;
const SYSTEM = `${N}/credential`;
const ACCOUNT_SYSTEM = 'https://accounts.google.com';

/** No usable token is stored; the practitioner must reconnect. */
export class MissingCalendarCredentialError extends Error {
  constructor() {
    super('Calendar credential is missing; reconnect required');
  }
}

/**
 * A rejected or missing token is durable: only the practitioner reconnecting repairs it.
 * @param err - A failure from reading or refreshing the token.
 * @returns True when retrying cannot succeed.
 */
export function needsReconnect(err: unknown): boolean {
  return (err instanceof GoogleOAuthError && err.isInvalidGrant) || err instanceof MissingCalendarCredentialError;
}

async function credential(medplum: MedplumClient, id: string): Promise<WithId<Basic> | undefined> {
  return medplum.searchOne('Basic', await projectQuery(medplum, { identifier: `${SYSTEM}|Basic/${id}` }), {
    cache: 'no-cache',
  });
}

/**
 * Identifies the stored token without reading it, so the connect Bot can tell whether its save landed.
 * @param medplum - The client.
 * @param connectionId - The connection the credential belongs to.
 * @returns A value that changes whenever the token does; undefined when no token is stored.
 */
export async function credentialRevision(medplum: MedplumClient, connectionId: string): Promise<string | undefined> {
  const saved = await credential(medplum, connectionId);
  // An empty placeholder from an interrupted first save holds no token.
  return saved && getExtensionValue(saved, TOKEN_URL) ? saved.meta?.versionId : undefined;
}

export async function writeCredential(lease: ConnectionLease, token: string, accountSub: string): Promise<void> {
  if (!token) {
    throw new Error('Missing refresh token');
  }
  const connection = await lease.read();
  const resource: Basic = {
    resourceType: 'Basic',
    code: { coding: [{ system: N, code: 'calendar-credential' }] },
    subject: connection.subject,
    identifier: [
      { system: SYSTEM, value: `Basic/${connection.id}` },
      { system: ACCOUNT_SYSTEM, value: accountSub },
    ],
  };
  const saved = await lease.medplum.createResourceIfNoneExist(
    resource,
    await projectQuery(lease.medplum, { identifier: `${SYSTEM}|Basic/${connection.id}` })
  );
  if (getIdentifier(saved, ACCOUNT_SYSTEM) !== accountSub) {
    throw new Error('Credential account mismatch');
  }
  await lease.check();
  await lease.medplum.updateResource(
    { ...resource, id: saved.id, meta: saved.meta, extension: [{ url: TOKEN_URL, valueString: token }] },
    ifMatch(saved)
  );
}

/**
 * Called only by workers holding the connection lease.
 * @param medplum - Worker client.
 * @param connection - Account-bound connection.
 * @returns The refresh token, for use only within the worker.
 */
export async function readCredential(medplum: MedplumClient, connection: CalendarConnection): Promise<string> {
  const saved = await credential(medplum, connection.basic.id);
  if (saved && getIdentifier(saved, ACCOUNT_SYSTEM) !== connection.accountSub) {
    throw new Error('Credential account mismatch');
  }
  const token = saved && getExtensionValue(saved, TOKEN_URL);
  if (typeof token !== 'string' || !token) {
    throw new MissingCalendarCredentialError();
  }
  return token;
}

export async function deleteCredential(lease: ConnectionLease): Promise<void> {
  const saved = await credential(lease.medplum, lease.id);
  if (saved) {
    await lease.check();
    await lease.medplum.deleteResource('Basic', saved.id, ifMatch(saved));
  }
}
