// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { PROFILES } from './profiles';

/* Connection state is worker-only. Practitioners read an allowlisted public summary.
 * Credentials are stored separately; this parser never returns a refresh token. */

import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue, getIdentifier } from '@medplum/core';
import type { Basic, Extension } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { EventDetailLevel } from './constants';
import { EVENT_DETAIL_LEVELS, GOOGLE_CALENDAR_NAMESPACE } from './constants';
import { TOKEN_URL, writeCredential } from './credentials';
import type { ConnectionLease } from './lease';
import { withConnectionLease } from './lease';
import { projectQuery } from './project';
import { readState, withState } from './state';

/** `Basic.code` for a Calendar Connection. */
export const CALENDAR_CONNECTION_CODE = 'calendar-connection';
/** The search that selects Calendar Connections, for AccessPolicy criteria. */
export const CONNECTION_SEARCH = `code=${GOOGLE_CALENDAR_NAMESPACE}|${CALENDAR_CONNECTION_CODE}`;

export const CONNECTION_IDENTIFIER_SYSTEM = `${GOOGLE_CALENDAR_NAMESPACE}/connection`;

const ACCOUNT_IDENTIFIER_SYSTEM = 'https://accounts.google.com';
const EXTENSION = {
  accountEmail: `${GOOGLE_CALENDAR_NAMESPACE}/account-email`,
  status: `${GOOGLE_CALENDAR_NAMESPACE}/status`,
  eventDetailLevel: `${GOOGLE_CALENDAR_NAMESPACE}/event-detail-level`,
} as const;

const CONNECTION_STATUSES = ['active', 'reauth-required', 'disconnecting'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface CalendarConnection {
  basic: WithId<Basic>;
  /** `Practitioner/<id>` */
  practitionerRef: string;
  /** The Google account `sub`. */
  accountSub: string;
  accountEmail?: string;
  status: ConnectionStatus;
  /** The practitioner's own, stricter level, if set. */
  eventDetailLevel?: EventDetailLevel;
}

/** What `saveConnection` needs; the rest is derived. */
export type CalendarConnectionInput = Omit<CalendarConnection, 'basic' | 'status'> & {
  refreshToken: string;
};

// A code extension is only trusted when it holds one of the known values.
function readCode<T extends string>(basic: Basic, url: string, allowed: readonly T[]): T | undefined {
  const value = getExtensionValue(basic, url);
  return allowed.find((v) => v === value);
}

/**
 * Reads a connection off its `Basic`. Unknown status or detail-level codes make the record
 * unreadable rather than silently ignored.
 * @param basic - The stored resource.
 * @returns The connection, or undefined when required fields are missing.
 */
export function readConnection(basic: WithId<Basic>): CalendarConnection | undefined {
  const practitionerRef = basic.subject?.reference;
  const accountSub = getIdentifier(basic, ACCOUNT_IDENTIFIER_SYSTEM);
  const status = readCode(basic, EXTENSION.status, CONNECTION_STATUSES);
  if (
    !basic.code.coding?.some((c) => c.system === GOOGLE_CALENDAR_NAMESPACE && c.code === CALENDAR_CONNECTION_CODE) ||
    !/^Practitioner\/[A-Za-z0-9.-]+$/.test(practitionerRef ?? '') ||
    !accountSub ||
    !status
  ) {
    return undefined;
  }
  return {
    basic,
    practitionerRef: practitionerRef as string,
    accountSub,
    accountEmail: getExtensionValue(basic, EXTENSION.accountEmail) as string | undefined,
    status,
    eventDetailLevel: readCode(basic, EXTENSION.eventDetailLevel, EVENT_DETAIL_LEVELS),
  };
}

/**
 * Finds a practitioner's connection in the current project.
 * @param medplum - The client.
 * @param practitionerRef - `Practitioner/<id>`.
 * @returns The connection, or undefined when not connected.
 */
export async function findConnection(
  medplum: MedplumClient,
  practitionerRef: string
): Promise<CalendarConnection | undefined> {
  const basic = await medplum.searchOne(
    'Basic',
    await projectQuery(medplum, `${CONNECTION_SEARCH}&subject=${practitionerRef}`)
  );
  return basic ? readConnection(basic) : undefined;
}

/**
 * Creates or replaces the practitioner's connection as `active`.
 * @param medplum - The client.
 * @param input - The connection fields.
 * @param projectDetailLevel - Current project ceiling, when connecting through the operation.
 * @param heldLease - Existing lease held while exchanging a reconnect grant.
 * @returns The saved connection.
 */
export async function saveConnection(
  medplum: MedplumClient,
  input: CalendarConnectionInput,
  projectDetailLevel?: EventDetailLevel,
  heldLease?: ConnectionLease
): Promise<CalendarConnection> {
  const existing = await medplum.searchOne(
    'Basic',
    await projectQuery(medplum, `${CONNECTION_SEARCH}&subject=${input.practitionerRef}`)
  );
  if (existing && getIdentifier(existing, ACCOUNT_IDENTIFIER_SYSTEM) !== input.accountSub) {
    throw new Error('Disconnect the existing Google account before switching accounts');
  }
  const extension: Extension[] = [{ url: EXTENSION.status, valueCode: 'active' }];
  if (input.accountEmail) {
    extension.push({ url: EXTENSION.accountEmail, valueString: input.accountEmail });
  }
  if (input.eventDetailLevel) {
    extension.push({ url: EXTENSION.eventDetailLevel, valueCode: input.eventDetailLevel });
  }
  const resource: Basic = {
    resourceType: 'Basic',
    meta: { profile: [PROFILES.connection] },
    id: existing?.id,
    code: { coding: [{ system: GOOGLE_CALENDAR_NAMESPACE, code: CALENDAR_CONNECTION_CODE }] },
    subject: { reference: input.practitionerRef },
    identifier: [
      { system: CONNECTION_IDENTIFIER_SYSTEM, value: input.practitionerRef },
      { system: ACCOUNT_IDENTIFIER_SYSTEM, value: input.accountSub },
    ],
    extension,
  };
  const current =
    existing ??
    (await medplum.createResourceIfNoneExist(
      {
        ...resource,
        extension: extension.map((e) => (e.url === EXTENSION.status ? { ...e, valueCode: 'reauth-required' } : e)),
      },
      await projectQuery(medplum, { identifier: `${CONNECTION_IDENTIFIER_SYSTEM}|${input.practitionerRef}` })
    ));
  if (getIdentifier(current, ACCOUNT_IDENTIFIER_SYSTEM) !== input.accountSub) {
    throw new Error('Disconnect the existing Google account before switching accounts');
  }
  const persist = async (lease: ConnectionLease): Promise<void> => {
    if (lease.id !== current.id) {
      throw new Error('Connection lease mismatch');
    }
    await writeCredential(lease, input.refreshToken, input.accountSub);
    await lease.mutate((latest) => {
      if (getIdentifier(latest, ACCOUNT_IDENTIFIER_SYSTEM) !== input.accountSub) {
        throw new Error('Disconnect the existing Google account before switching accounts');
      }
      const disconnecting = readConnection(latest)?.status === 'disconnecting';
      const changedUrls = new Set(extension.map((e) => e.url));
      const state = readState(latest);
      // A replacement grant must be revoked during any still-pending disconnect.
      state.credentialRevoked = false;
      state.inboundRetryAt = undefined;
      state.inboundRequest = randomUUID();
      state.outboundRequest = randomUUID();
      state.privacyPending = true;
      if (projectDetailLevel) {
        state.projectDetailLevel = projectDetailLevel;
      }
      return withState(
        {
          ...latest,
          meta: { ...latest.meta, profile: [PROFILES.connection] },
          identifier: [
            ...(latest.identifier ?? []).filter(
              (i) => i.system !== CONNECTION_IDENTIFIER_SYSTEM && i.system !== ACCOUNT_IDENTIFIER_SYSTEM
            ),
            ...(resource.identifier ?? []),
          ],
          extension: [
            ...(latest.extension ?? []).filter((e) => !changedUrls.has(e.url) && e.url !== TOKEN_URL),
            ...extension.map((e) =>
              e.url === EXTENSION.status && disconnecting ? { ...e, valueCode: 'disconnecting' } : e
            ),
          ],
        },
        state
      );
    });
  };
  if (heldLease) {
    await persist(heldLease);
  } else {
    await withConnectionLease(medplum, current.id, persist);
  }
  const connection = readConnection(await medplum.readResource('Basic', current.id, { cache: 'no-cache' }));
  if (!connection) {
    throw new Error('Saved connection is unreadable');
  }
  return connection;
}

/**
 * Changes the status or detail level and nothing else, with writes guarded by the
 * version it was read at, so a stale copy can't overwrite a newer write.
 * @param medplum - The client.
 * @param connection - The connection as last read.
 * @param changes - The fields to change.
 * @param changes.status - New status.
 * @param changes.eventDetailLevel - New practitioner-level detail level.
 * @param lease - An existing lease when called from a worker.
 * @returns The updated connection.
 */
export async function updateConnection(
  medplum: MedplumClient,
  connection: CalendarConnection,
  changes: { status?: ConnectionStatus; eventDetailLevel?: EventDetailLevel },
  lease?: ConnectionLease
): Promise<CalendarConnection> {
  const apply = async (held: ConnectionLease): Promise<void> => {
    await held.mutate((basic) => {
      const values: Extension[] = [];
      if (changes.status) {
        values.push({ url: EXTENSION.status, valueCode: changes.status });
      }
      if (changes.eventDetailLevel) {
        values.push({ url: EXTENSION.eventDetailLevel, valueCode: changes.eventDetailLevel });
      }
      const urls = new Set(values.map((e) => e.url));
      const state = readState(basic);
      if (changes.eventDetailLevel) {
        state.privacyPending = true;
        state.outboundRequest = randomUUID();
      }
      if (changes.status === 'reauth-required') {
        state.staleReason = 'reauth-required';
      }
      return withState(
        { ...basic, extension: [...(basic.extension ?? []).filter((e) => !urls.has(e.url)), ...values] },
        state
      );
    });
  };
  if (lease) {
    await apply(lease);
  } else {
    await withConnectionLease(medplum, connection.basic.id, async (held) => {
      if (held.originalVersion !== connection.basic.meta?.versionId) {
        throw new Error('Stale calendar connection; reload and retry');
      }
      await apply(held);
    });
  }
  const updated = readConnection(await medplum.readResource('Basic', connection.basic.id, { cache: 'no-cache' }));
  if (!updated) {
    throw new Error('Updated connection is unreadable');
  }
  return updated;
}
