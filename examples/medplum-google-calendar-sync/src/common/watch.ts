// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { projectQuery } from './project';

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CONNECTION_SEARCH, readConnection } from './connection';
import type { GoogleCalendarClient } from './google-calendar';
import type { ConnectionLease } from './lease';
import { ifMatch, isVersionConflict } from './lease';
import { CHANNEL_IDENTIFIER_SYSTEM, readState, withState } from './state';

export function channelTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function ensureWatch(
  lease: ConnectionLease,
  calendar: Pick<GoogleCalendarClient, 'watchEvents' | 'stopChannel'>,
  address: string
): Promise<void> {
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Calendar webhook must use HTTPS');
  }
  let state = readState(await lease.read());
  const live = state.channels
    .filter((c) => c.resourceId && Date.parse(c.expires) > Date.now())
    .sort((a, b) => Date.parse(b.expires) - Date.parse(a.expires));
  if (!live[0] || Date.parse(live[0].expires) < Date.now() + 24 * 60 * 60_000) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const pending = {
      id,
      tokenHash: channelTokenHash(token),
      expires: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    };
    // Persist before watch: Google's initial callback may arrive before the response.
    await lease.mutate((basic) =>
      withState(basic, { ...readState(basic), channels: [...readState(basic).channels, pending] })
    );
    const registered = await calendar.watchEvents(id, token, address);
    const expires = Number(registered.expiration);
    if (registered.id !== id || !registered.resourceId || !Number.isFinite(expires) || expires <= Date.now()) {
      throw new Error('Google returned an invalid watch registration');
    }
    await lease.mutate((basic) =>
      withState(basic, {
        ...readState(basic),
        channels: readState(basic).channels.map((c) =>
          c.id === id ? { ...c, resourceId: registered.resourceId, expires: new Date(expires).toISOString() } : c
        ),
      })
    );
  }
  state = readState(await lease.read());
  const primary = [...state.channels]
    .filter((c) => c.resourceId && Date.parse(c.expires) > Date.now())
    .sort((a, b) => Date.parse(b.expires) - Date.parse(a.expires))[0];
  for (const old of state.channels) {
    if (old.id === primary?.id) {
      continue;
    }
    if (old.resourceId && Date.parse(old.expires) > Date.now()) {
      await calendar.stopChannel(old.id, old.resourceId);
    }
    // A registration whose response was lost has no resourceId. Invalidate its token locally;
    // Google will expire that unreachable channel at its requested seven-day TTL.
    await lease.mutate((basic) =>
      withState(basic, { ...readState(basic), channels: readState(basic).channels.filter((c) => c.id !== old.id) })
    );
  }
}

function denied(): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'forbidden', details: { text: 'Invalid Google Calendar notification' } }],
  };
}

export async function receiveNotification(
  medplum: MedplumClient,
  headers: BotEvent['headers']
): Promise<OperationOutcome | undefined> {
  const header = (name: string): string | undefined => {
    const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];
    return typeof value === 'string' ? value : undefined;
  };
  const id = header('x-goog-channel-id');
  const token = header('x-goog-channel-token');
  const resourceId = header('x-goog-resource-id');
  const message = header('x-goog-message-number');
  const resourceState = header('x-goog-resource-state');
  if (
    !id ||
    id.length > 128 ||
    !token ||
    token.length > 256 ||
    !resourceId ||
    resourceId.length > 1024 ||
    !message ||
    !/^\d{1,30}$/.test(message) ||
    !['sync', 'exists', 'not_exists'].includes(resourceState ?? '')
  ) {
    return denied();
  }
  const found = await medplum.searchOne(
    'Basic',
    await projectQuery(
      medplum,
      `${CONNECTION_SEARCH}&${new URLSearchParams({ identifier: `${CHANNEL_IDENTIFIER_SYSTEM}|${id}` })}`
    )
  );
  if (!found) {
    return denied();
  }
  for (let attempt = 0; ; attempt++) {
    const basic = await medplum.readResource('Basic', found.id, { cache: 'no-cache' });
    const connection = readConnection(basic);
    const state = readState(basic);
    const channel = state.channels.find((c) => c.id === id);
    const expected = Buffer.from(channel?.tokenHash ?? '', 'hex');
    const actual = Buffer.from(channelTokenHash(token), 'hex');
    if (
      connection?.status !== 'active' ||
      !channel ||
      !Number.isFinite(Date.parse(channel.expires)) ||
      Date.parse(channel.expires) <= Date.now() ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return denied();
    }
    if (!channel.resourceId) {
      // Only the authenticated initial sync can precede registration. The registering worker
      // always fetches a snapshot after the watch response, so this acknowledgement loses no changes.
      return resourceState === 'sync' ? undefined : denied();
    }
    if (channel.resourceId !== resourceId) {
      return denied();
    }
    if (channel.lastMessage && BigInt(message) <= BigInt(channel.lastMessage)) {
      return undefined;
    }
    channel.lastMessage = message;
    state.inboundRequest = randomUUID();
    try {
      await medplum.updateResource(withState(basic, state), ifMatch(basic));
      return undefined;
    } catch (err) {
      if (attempt >= 4 || !isVersionConflict(err)) {
        throw err;
      }
    }
  }
}
