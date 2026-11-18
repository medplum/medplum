// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type { Parameters, Resource } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import type { CalendarConnection } from './common/connection';
import { saveConnection } from './common/connection';
import { BOT_IDENTIFIER_SYSTEM } from './common/constants';

export async function operationIdentity(medplum: MockClient, event: BotEvent, identifier: string): Promise<void> {
  const id = event.bot.reference?.split('/')[1] as string;
  const resource: Resource = {
    resourceType: 'Bot',
    id,
    name: 'Operation',
    identifier: [{ system: BOT_IDENTIFIER_SYSTEM, value: identifier }],
  };
  vi.spyOn(medplum, 'getProfileAsync').mockResolvedValue(
    resource as unknown as Awaited<ReturnType<MockClient['getProfileAsync']>>
  );
  vi.spyOn(medplum, 'getProjectMembership').mockReturnValue({
    resourceType: 'ProjectMembership',
    id: 'membership',
    user: { reference: `Bot/${id}` },
    profile: { reference: `Bot/${id}` },
    admin: false,
  } as NonNullable<ReturnType<MockClient['getProjectMembership']>>);
  vi.spyOn(medplum, 'getAccessPolicy').mockReturnValue({
    resourceType: 'AccessPolicy',
    resource: [{ resourceType: 'Practitioner', readonly: true }],
  });
  const requester = event.requester?.reference?.split('/')[1];
  if (requester) {
    try {
      await medplum.readResource('Practitioner', requester);
    } catch {
      await medplum.createResource({ resourceType: 'Practitioner', id: requester });
    }
  }
}
export const empty: Parameters = { resourceType: 'Parameters' };

export const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function idToken(claims: Record<string, unknown>): string {
  const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

export function connect(
  medplum: MockClient,
  practitionerRef = 'Practitioner/p',
  accountSub = 'sub',
  refreshToken = 'rt'
): Promise<CalendarConnection> {
  return saveConnection(medplum, { practitionerRef, accountSub, refreshToken });
}
