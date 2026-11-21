// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import type { Basic, Extension } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { EventDetailLevel } from './constants';
import { GOOGLE_CALENDAR_NAMESPACE } from './constants';
import { assertCurrentProject } from './project';
import { ifMatch, isVersionConflict } from './versioning';

export const STATE_URL = `${GOOGLE_CALENDAR_NAMESPACE}/sync-state`;
export const CHANNEL_IDENTIFIER_SYSTEM = `${GOOGLE_CALENDAR_NAMESPACE}/watch-channel`;

export interface WatchChannel {
  id: string;
  tokenHash: string;
  resourceId?: string;
  expires: string;
  lastMessage?: string;
  /** The webhook address the channel was registered with; absent on channels from earlier versions. */
  address?: string;
}
export interface SyncState {
  inboundRequest?: string;
  inboundCompleted?: string;
  outboundCompleted?: string;
  outboundRequest?: string;
  lastInbound?: string;
  inboundRetryAt?: string;
  outboundRetryAt?: string;
  watchRetryAt?: string;
  lastOutbound?: string;
  staleReason?: string;
  inboundError?: string;
  outboundError?: string;
  privacyPending?: boolean;
  projectDetailLevel?: EventDetailLevel;
  channels: WatchChannel[];
  forgetRevoked?: boolean;
  googleCleaned?: boolean;
  credentialRevoked?: boolean;
  cleanupIssue?: string;
  slotsCleaned?: boolean;
  statusPublishPending?: boolean;
}

const STRINGS = [
  'inboundRequest',
  'inboundCompleted',
  'outboundCompleted',
  'outboundRequest',
  'staleReason',
  'inboundError',
  'outboundError',
  'cleanupIssue',
] as const;
const INSTANTS = ['lastInbound', 'lastOutbound', 'inboundRetryAt', 'outboundRetryAt', 'watchRetryAt'] as const;
const BOOLEANS = [
  'privacyPending',
  'forgetRevoked',
  'googleCleaned',
  'slotsCleaned',
  'credentialRevoked',
  'statusPublishPending',
] as const;

export function readState(basic: Basic): SyncState {
  const fields = basic.extension?.find((e) => e.url === STATE_URL)?.extension ?? [];
  const state: SyncState = { channels: [] };
  for (const key of STRINGS) {
    state[key] = fields.find((e) => e.url === key)?.valueString;
  }
  for (const key of INSTANTS) {
    state[key] = fields.find((e) => e.url === key)?.valueInstant;
  }
  for (const key of BOOLEANS) {
    state[key] = fields.find((e) => e.url === key)?.valueBoolean;
  }
  state.projectDetailLevel = fields.find((e) => e.url === 'projectDetailLevel')?.valueCode as
    EventDetailLevel | undefined;
  for (const field of fields) {
    const text = (url: string): string => field.extension?.find((e) => e.url === url)?.valueString ?? '';
    const instant = (url: string): string => field.extension?.find((e) => e.url === url)?.valueInstant ?? '';
    if (field.url === 'channel') {
      state.channels.push({
        id: text('id'),
        tokenHash: text('tokenHash'),
        resourceId: text('resourceId') || undefined,
        expires: instant('expires'),
        lastMessage: text('lastMessage') || undefined,
        address: text('address') || undefined,
      });
    }
  }
  return state;
}

export function withState(basic: Basic, state: SyncState): Basic {
  const fields: Extension[] = [];
  for (const key of STRINGS) {
    if (state[key] !== undefined) {
      fields.push({ url: key, valueString: state[key] });
    }
  }
  for (const key of INSTANTS) {
    if (state[key] !== undefined) {
      fields.push({ url: key, valueInstant: state[key] });
    }
  }
  for (const key of BOOLEANS) {
    if (state[key] !== undefined) {
      fields.push({ url: key, valueBoolean: state[key] });
    }
  }
  if (state.projectDetailLevel) {
    fields.push({ url: 'projectDetailLevel', valueCode: state.projectDetailLevel });
  }
  for (const channel of state.channels) {
    fields.push({
      url: 'channel',
      extension: [
        { url: 'id', valueString: channel.id },
        { url: 'tokenHash', valueString: channel.tokenHash },
        { url: 'expires', valueInstant: channel.expires },
        ...(channel.lastMessage ? [{ url: 'lastMessage', valueString: channel.lastMessage }] : []),
        ...(channel.resourceId ? [{ url: 'resourceId', valueString: channel.resourceId }] : []),
        ...(channel.address ? [{ url: 'address', valueString: channel.address }] : []),
      ],
    });
  }
  return {
    ...basic,
    identifier: [
      ...(basic.identifier ?? []).filter((i) => i.system !== CHANNEL_IDENTIFIER_SYSTEM),
      ...state.channels.map((c) => ({ system: CHANNEL_IDENTIFIER_SYSTEM, value: c.id })),
    ],
    extension: [
      ...(basic.extension ?? []).filter((e) => e.url !== STATE_URL),
      ...(fields.length ? [{ url: STATE_URL, extension: fields }] : []),
    ],
  };
}

/**
 * Queue state changes without acquiring or replacing the worker lease. Never write credentials or remote data here.
 * @param medplum - The authenticated operation or worker client.
 * @param id - Connection in the current project.
 * @param change - Pure mutation, reapplied to the latest version after a conflict.
 * @returns The saved connection state.
 */
export async function mutateConnectionState(
  medplum: MedplumClient,
  id: string,
  change: (basic: WithId<Basic>) => Basic
): Promise<WithId<Basic>> {
  for (let attempt = 0; ; attempt++) {
    const basic = await medplum.readResource('Basic', id, { cache: 'no-cache' });
    await assertCurrentProject(medplum, basic);
    const updated = change(basic);
    try {
      return await medplum.updateResource(updated, ifMatch(basic));
    } catch (err) {
      if (attempt >= 4 || !isVersionConflict(err)) {
        throw err;
      }
    }
  }
}

// Workers rebase their writes on the latest version, preserving requests queued during a run.
export async function requestSync(
  medplum: MedplumClient,
  id: string,
  directions: ('inbound' | 'outbound')[],
  privacyPending = false
): Promise<void> {
  await mutateConnectionState(medplum, id, (basic) => {
    const state = readState(basic);
    if (privacyPending) {
      state.privacyPending = true;
    }
    for (const direction of directions) {
      state[`${direction}Request`] = randomUUID();
    }
    return withState(basic, state);
  });
}
