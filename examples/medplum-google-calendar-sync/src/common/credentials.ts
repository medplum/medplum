// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { PROFILES } from './profiles';
import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue, getIdentifier } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import { GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import type { CalendarConnection } from './connection';
import type { ConnectionLease } from './lease';
import { ifMatch } from './lease';
import { projectQuery } from './project';

export const CREDENTIAL_SEARCH = `code=${N}|calendar-credential`;
export const TOKEN_URL = `${N}/refresh-token`;
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
  // Transitional worker-only read permits an interrupted install to resume migration.
  const token = getExtensionValue(saved ?? connection.basic, TOKEN_URL);
  if (typeof token !== 'string' || !token) {
    throw new Error('Calendar credential is missing; reconnect required');
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
  await writeCredential(lease, token, sub);
  await lease.mutate((current) => ({
    ...current,
    meta: { ...current.meta, profile: [PROFILES.connection] },
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
