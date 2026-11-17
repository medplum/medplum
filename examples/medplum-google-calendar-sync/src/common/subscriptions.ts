// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Bot, Subscription } from '@medplum/fhirtypes';
import { CONNECTION_SEARCH } from './connection';
import { IMPORT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM } from './constants';
import { projectQuery } from './project';
import { STATE_URL } from './state';
import { ifMatch } from './versioning';

const SUBSCRIPTION_INTERACTION_EXTENSION_URL =
  'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction';

/**
 * Deliver Appointment and Slot changes to the sync Bot. Imported Slots are excluded so the
 * integration never mirrors its own writes. The endpoint must be the literal `Bot/<id>`.
 * @param medplum - The client.
 * @param syncBot - The shared sync Bot.
 * @param criteria - Scheduling resource type.
 * @returns The Subscription.
 */
export async function ensureSyncSubscription(
  medplum: MedplumClient,
  syncBot: WithId<Bot>,
  criteria: 'Appointment' | 'Slot'
): Promise<WithId<Subscription>> {
  const tag = { system: INSTALL_SYSTEM, code: `subscription-${criteria.toLowerCase()}` };
  const desired: Subscription = {
    resourceType: 'Subscription',
    meta: { tag: [tag] },
    status: 'active',
    reason: `Mirror ${criteria} changes to practitioners' Google Calendars`,
    criteria,
    channel: { type: 'rest-hook', endpoint: getReferenceString(syncBot) },
    extension: [
      ...(criteria === 'Slot'
        ? [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
              valueString: `(%current.exists() and %current.identifier.where(system='${IMPORT_IDENTIFIER_SYSTEM}').empty()) or (%previous.exists() and %previous.identifier.where(system='${IMPORT_IDENTIFIER_SYSTEM}').empty())`,
            },
          ]
        : []),
      ...['create', 'update', 'delete'].map((valueCode) => ({
        url: SUBSCRIPTION_INTERACTION_EXTENSION_URL,
        valueCode,
      })),
    ],
  };
  const existing = await medplum.searchOne(
    'Subscription',
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  return existing
    ? medplum.updateResource(
        { ...desired, id: existing.id, meta: { ...existing.meta, ...desired.meta } },
        ifMatch(existing)
      )
    : medplum.createResourceIfNoneExist(desired, await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` }));
}

export function transitionExpression(field: string): string {
  const path = `extension.where(url='${STATE_URL}').extension.where(url='${field}').valueString`;
  return `%current.${path}.exists() and (%previous.${path}.empty() or %previous.${path} != %current.${path})`;
}

export async function ensureWorkSubscription(
  medplum: MedplumClient,
  bot: WithId<Bot>,
  direction: 'inbound' | 'outbound'
): Promise<void> {
  const tag = { system: INSTALL_SYSTEM, code: `${direction}-work` };
  const desired: Subscription = {
    resourceType: 'Subscription',
    meta: { tag: [tag] },
    status: 'active',
    reason: `Process requested Google Calendar ${direction} work`,
    criteria: `Basic?${CONNECTION_SEARCH}`,
    channel: { type: 'rest-hook', endpoint: getReferenceString(bot) },
    extension: [
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'create' },
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'update' },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
        valueString: transitionExpression(`${direction}Request`),
      },
    ],
  };
  const saved = await medplum.createResourceIfNoneExist(
    desired,
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  await medplum.updateResource({ ...desired, id: saved.id, meta: { ...saved.meta, ...desired.meta } }, ifMatch(saved));
}
