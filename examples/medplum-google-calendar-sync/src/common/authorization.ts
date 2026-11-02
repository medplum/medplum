// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Resource } from '@medplum/fhirtypes';
import type { BotEvent, MedplumClient } from '@medplum/core';
import { BOT_IDENTIFIER_SYSTEM } from './constants';
import { currentProjectId, assertCurrentProject } from './project';
import { requirePractitionerRequester } from './operations';

export async function requireBotMembership(medplum: MedplumClient, event: BotEvent, identifier: string): Promise<void> {
  const profile = (await medplum.getProfileAsync()) as Resource | undefined;
  const membership = medplum.getProjectMembership();
  const project = await currentProjectId(medplum);
  // /auth/me returns a membership summary without project or accessPolicy references.
  // Its separate authenticated project and evaluated access policy carry that context.
  const accessPolicy = medplum.getAccessPolicy();
  if (
    profile?.resourceType !== 'Bot' ||
    event.bot?.reference !== `Bot/${profile.id}` ||
    !profile.identifier?.some((i) => i.system === BOT_IDENTIFIER_SYSTEM && i.value === identifier) ||
    membership?.profile?.reference !== `Bot/${profile.id}` ||
    (membership?.project && membership.project.reference !== `Project/${project}`) ||
    membership.active === false ||
    membership.admin ||
    !accessPolicy?.resource?.length
  ) {
    throw new Error('Calendar operation requires its restricted Bot membership; reinstall the integration');
  }
}

export async function requireOperationBot(
  medplum: MedplumClient,
  event: BotEvent,
  identifier: string
): Promise<string> {
  const practitioner = requirePractitionerRequester(event);
  await requireBotMembership(medplum, event, identifier);
  await assertCurrentProject(medplum, await medplum.readReference({ reference: practitioner }, { cache: 'no-cache' }));
  return practitioner;
}
