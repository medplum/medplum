// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type { Parameters, Resource } from '@medplum/fhirtypes';
import type { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
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
    project: { reference: `Project/${medplum.getProject()?.id}` },
    user: { reference: `Bot/${id}` },
    profile: { reference: `Bot/${id}` },
    active: true,
    admin: false,
    accessPolicy: { reference: 'AccessPolicy/operation' },
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
