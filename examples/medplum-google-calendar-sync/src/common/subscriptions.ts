// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Bot, Subscription } from '@medplum/fhirtypes';
import { CONNECTION_SEARCH } from './connection';
import { GOOGLE_CALENDAR_NAMESPACE, IMPORT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM } from './constants';
import { ifMatch } from './lease';
import { projectQuery } from './project';
import { PUBLIC_STATUS_SEARCH } from './public-status';
import { STATE_URL } from './state';

const SUBSCRIPTION_INTERACTION_EXTENSION_URL =
  'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction';

/**
 * Install scoped scheduling delivery. Schedule and PractitionerRole deletes use a separate
 * Subscription because their transition expressions apply only to creates and updates.
 * The endpoint must be the literal `Bot/<id>`; an identifier isn't accepted.
 * @param medplum - The client.
 * @param syncBot - The shared sync Bot.
 * @param criteria - Scheduling resource type.
 * @param deleteOnly - Separate deletion delivery without a transition expression.
 * @returns The Subscription.
 */
export async function ensureSyncSubscription(
  medplum: MedplumClient,
  syncBot: WithId<Bot>,
  criteria: 'Appointment' | 'Slot' | 'Schedule' | 'PractitionerRole',
  deleteOnly = false
): Promise<WithId<Subscription>> {
  const tag = { system: INSTALL_SYSTEM, code: `subscription-${criteria.toLowerCase()}${deleteOnly ? '-delete' : ''}` };
  const normalInteractions = ['Schedule', 'PractitionerRole'].includes(criteria)
    ? ['create', 'update']
    : ['create', 'update', 'delete'];
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
      ...(!deleteOnly && ['Schedule', 'PractitionerRole'].includes(criteria)
        ? [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
              valueString: `%previous.empty() or %current.empty() or (%previous.active ~ %current.active).not() or (%previous.${criteria === 'Schedule' ? 'actor' : 'practitioner'} ~ %current.${criteria === 'Schedule' ? 'actor' : 'practitioner'}).not()`,
            },
          ]
        : []),
      ...(deleteOnly ? ['delete'] : normalInteractions).map((valueCode) => ({
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

/**
 * Customer-owned workflow; this helper does not install or send notifications.
 * @param botReference - Customer-owned workflow Bot endpoint.
 * @param signal - State transition to observe.
 * @returns A Subscription for the administrator to install.
 */
export function notificationSubscription(botReference: string, signal: 'reauth' | 'conflicts'): Subscription {
  if (!/^Bot\/[A-Za-z0-9.-]+$/.test(botReference)) {
    throw new Error('A customer Bot reference is required');
  }
  const status = `extension.where(url='${GOOGLE_CALENDAR_NAMESPACE}/status').valueCode`;
  const expression =
    signal === 'conflicts'
      ? transitionExpression('conflictsRevision')
      : `%current.${status} = 'reauth-required' and (%previous.${status}.empty() or %previous.${status} != 'reauth-required')`;
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: `Customer workflow for Google Calendar ${signal}`,
    criteria: `Basic?${PUBLIC_STATUS_SEARCH}`,
    channel: { type: 'rest-hook', endpoint: botReference },
    extension: [
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'create' },
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'update' },
      { url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression', valueString: expression },
    ],
  };
}
