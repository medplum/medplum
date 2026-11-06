// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue, getIdentifier } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import { CONNECTION_IDENTIFIER_SYSTEM } from './connection';
import { GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import type { ConnectionLease } from './lease';
import { PROFILES } from './profiles';
import { projectQuery } from './project';
import { ifMatch } from './versioning';

export const CREDENTIAL_SEARCH = `code=${N}|calendar-credential`;
export const TOKEN_URL = `${N}/refresh-token`;
export class MissingCalendarCredentialError extends Error {
  constructor() {
    super('Calendar credential is missing; reconnect required');
  }
}
const SYSTEM = `${N}/credential`;

async function credential(medplum: MedplumClient, id: string): Promise<WithId<Basic> | undefined> {
  return medplum.searchOne('Basic', await projectQuery(medplum, { identifier: `${SYSTEM}|Basic/${id}` }), {
    cache: 'no-cache',
  });
}

export async function writeCredential(lease: ConnectionLease, token: string, accountSub: string): Promise<void> {
  if (!token) {
    throw new Error('Missing refresh token');
  }
  const connection = await lease.read();
  const resource: Basic = {
    resourceType: 'Basic',
    meta: { profile: [PROFILES.credential] },
    code: { coding: [{ system: N, code: 'calendar-credential' }] },
    subject: connection.subject,
    identifier: [
      { system: SYSTEM, value: `Basic/${connection.id}` },
      { system: 'https://accounts.google.com', value: accountSub },
    ],
    extension: [{ url: TOKEN_URL, valueString: token }],
  };
  const saved = await lease.medplum.createResourceIfNoneExist(
    resource,
    await projectQuery(lease.medplum, { identifier: `${SYSTEM}|Basic/${connection.id}` })
  );
  if (getIdentifier(saved, 'https://accounts.google.com') !== accountSub) {
    throw new Error('Credential account mismatch');
  }
  await lease.check();
  if (getExtensionValue(saved, TOKEN_URL) !== token) {
    await lease.medplum.updateResource(
      { ...resource, id: saved.id, meta: { ...saved.meta, profile: [PROFILES.credential] } },
      ifMatch(saved)
    );
  }
}

/**
 * Called only by workers holding the connection lease. Never used by status or webhook.
 * @param medplum - Restricted worker client.
 * @param connection - Account-bound connection.
 * @returns The refresh token, for use only within the worker.
 */
export async function readCredential(medplum: MedplumClient, connection: CalendarConnection): Promise<string> {
  const saved = await credential(medplum, connection.basic.id);
  if (saved && getIdentifier(saved, 'https://accounts.google.com') !== connection.accountSub) {
    throw new Error('Credential account mismatch');
  }
  // Worker-only fallback supports the optional prototype migration; installation does not migrate tokens.
  const token = getExtensionValue(saved ?? connection.basic, TOKEN_URL);
  if (typeof token !== 'string' || !token) {
    throw new MissingCalendarCredentialError();
  }
  return token;
}

export async function migrateCredential(lease: ConnectionLease): Promise<void> {
  const basic = await lease.read();
  const token = getExtensionValue(basic, TOKEN_URL);
  if (typeof token !== 'string') {
    return;
  }
  const sub = getIdentifier(basic, 'https://accounts.google.com');
  if (!sub) {
    throw new Error('Legacy credential has no account identity');
  }
  const practitionerRef = basic.subject?.reference;
  if (!practitionerRef?.startsWith('Practitioner/')) {
    throw new Error('Legacy connection has no practitioner identity');
  }
  const matches = await lease.medplum.searchResources(
    'Basic',
    await projectQuery(lease.medplum, { identifier: `${CONNECTION_IDENTIFIER_SYSTEM}|${practitionerRef}` })
  );
  if (matches.some((match) => match.id !== basic.id)) {
    throw new Error('Ambiguous legacy connection identity');
  }
  const existingIdentity = getIdentifier(basic, CONNECTION_IDENTIFIER_SYSTEM);
  if (existingIdentity && existingIdentity !== practitionerRef) {
    throw new Error('Legacy connection identity mismatch');
  }
  await writeCredential(lease, token, sub);
  await lease.mutate((current) => ({
    ...current,
    meta: { ...current.meta, profile: [PROFILES.connection] },
    identifier: [
      ...(current.identifier ?? []).filter((i) => i.system !== CONNECTION_IDENTIFIER_SYSTEM),
      { system: CONNECTION_IDENTIFIER_SYSTEM, value: practitionerRef },
    ],
    extension: current.extension?.filter((e) => e.url !== TOKEN_URL),
  }));
}

export async function deleteCredential(lease: ConnectionLease): Promise<void> {
  const saved = await credential(lease.medplum, lease.id);
  if (saved) {
    await lease.check();
    await lease.medplum.deleteResource('Basic', saved.id, ifMatch(saved));
  }
}
