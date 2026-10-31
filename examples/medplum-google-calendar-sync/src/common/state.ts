// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { Basic, Extension } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { EventDetailLevel } from './constants';
import { GOOGLE_CALENDAR_NAMESPACE } from './constants';
import type { CalendarConflict } from './import';
import { ifMatch, isVersionConflict } from './lease';

export const STATE_URL = `${GOOGLE_CALENDAR_NAMESPACE}/sync-state`;
export const CHANNEL_IDENTIFIER_SYSTEM = `${GOOGLE_CALENDAR_NAMESPACE}/watch-channel`;

export interface WatchChannel {
  id: string;
  tokenHash: string;
  resourceId?: string;
  expires: string;
  lastMessage?: string;
}
export interface OutboundWork {
  start: string;
  end: string;
  phase: 'discover' | 'repair';
  cursor?: string;
  errors: number;
  request: string;
}

export interface SyncState {
  outboundWork?: OutboundWork;
  requestedRangeStart?: string;
  requestedRangeEnd?: string;
  inboundRequest?: string;
  inboundCompleted?: string;
  outboundCompleted?: string;
  outboundRequest?: string;
  lastInbound?: string;
  inboundRetryAt?: string;
  outboundRetryAt?: string;
  lastOutbound?: string;
  staleReason?: string;
  inboundError?: string;
  outboundError?: string;
  privacyPending?: boolean;
  projectDetailLevel?: EventDetailLevel;
  conflicts: CalendarConflict[];
  channels: WatchChannel[];
  forgetRevoked?: boolean;
  googleCleaned?: boolean;
  credentialRevoked?: boolean;
  cleanupIssue?: string;
  slotsCleaned?: boolean;
  conflictsRevision?: string;
}

const STRINGS = [
  'inboundRequest',
  'inboundCompleted',
  'outboundCompleted',
  'outboundRequest',
  'staleReason',
  'inboundError',
  'outboundError',
  'conflictsRevision',
  'cleanupIssue',
] as const;
const INSTANTS = [
  'lastInbound',
  'lastOutbound',
  'inboundRetryAt',
  'outboundRetryAt',
  'requestedRangeStart',
  'requestedRangeEnd',
] as const;
const BOOLEANS = ['privacyPending', 'forgetRevoked', 'googleCleaned', 'slotsCleaned', 'credentialRevoked'] as const;

export function readState(basic: Basic): SyncState {
  const fields = basic.extension?.find((e) => e.url === STATE_URL)?.extension ?? [];
  const state: SyncState = { conflicts: [], channels: [] };
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
    if (field.url === 'outboundWork') {
      const phase = field.extension?.find((e) => e.url === 'phase')?.valueCode;
      if (
        !['discover', 'repair'].includes(phase ?? '') ||
        !Number.isFinite(Date.parse(instant('start'))) ||
        !(Date.parse(instant('end')) > Date.parse(instant('start')))
      ) {
        throw new Error('Invalid outbound checkpoint requires repair');
      }
      state.outboundWork = {
        start: instant('start'),
        end: instant('end'),
        phase: field.extension?.find((e) => e.url === 'phase')?.valueCode as 'discover' | 'repair',
        cursor: text('cursor') || undefined,
        errors: field.extension?.find((e) => e.url === 'errors')?.valueUnsignedInt ?? 0,
        request: text('request'),
      };
    }
    if (field.url === 'channel') {
      state.channels.push({
        id: text('id'),
        tokenHash: text('tokenHash'),
        resourceId: text('resourceId') || undefined,
        expires: instant('expires'),
        lastMessage: text('lastMessage') || undefined,
      });
    }
    if (field.url === 'conflict') {
      state.conflicts.push({
        key: text('key'),
        appointment: field.extension?.find((e) => e.url === 'appointment')?.valueReference?.reference ?? '',
        schedules: (field.extension ?? [])
          .filter((e) => e.url === 'schedule')
          .map((e) => e.valueReference?.reference ?? ''),
        start: instant('start'),
        end: instant('end'),
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
  if (state.outboundWork) {
    const work = state.outboundWork;
    fields.push({
      url: 'outboundWork',
      extension: [
        { url: 'start', valueInstant: work.start },
        { url: 'end', valueInstant: work.end },
        { url: 'phase', valueCode: work.phase },
        { url: 'errors', valueUnsignedInt: work.errors },
        { url: 'request', valueString: work.request },
        ...(work.cursor ? [{ url: 'cursor', valueString: work.cursor }] : []),
      ],
    });
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
      ],
    });
  }
  for (const conflict of state.conflicts) {
    fields.push({
      url: 'conflict',
      extension: [
        { url: 'key', valueString: conflict.key },
        { url: 'appointment', valueReference: { reference: conflict.appointment } },
        { url: 'start', valueInstant: conflict.start },
        { url: 'end', valueInstant: conflict.end },
        ...conflict.schedules.map((reference) => ({ url: 'schedule', valueReference: { reference } })),
      ],
    });
  }
  return {
    ...basic,
    identifier: [
      ...(basic.identifier ?? []).filter((i) => i.system !== CHANNEL_IDENTIFIER_SYSTEM),
      ...state.channels.map((c) => ({ system: CHANNEL_IDENTIFIER_SYSTEM, value: c.id })),
    ],
    extension: [...(basic.extension ?? []).filter((e) => e.url !== STATE_URL), { url: STATE_URL, extension: fields }],
  };
}

// Request markers are intentionally allowed while a lease is held. They never change credentials,
// lifecycle, ownership, or Google/Slot data. Workers rebase their state writes on the latest version.
export async function requestSync(
  medplum: MedplumClient,
  id: string,
  directions: ('inbound' | 'outbound')[],
  privacyPending = false
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const basic = await medplum.readResource('Basic', id, { cache: 'no-cache' });
    const state = readState(basic);
    if (privacyPending) {
      state.privacyPending = true;
    }
    for (const direction of directions) {
      state[`${direction}Request`] = randomUUID();
    }
    try {
      await medplum.updateResource(withState(basic, state), ifMatch(basic));
      return;
    } catch (err) {
      if (attempt >= 4 || !isVersionConflict(err)) {
        throw err;
      }
    }
  }
}
