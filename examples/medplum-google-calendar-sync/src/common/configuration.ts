// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import { getExtensionValue } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import type { EventDetailLevel } from './constants';
import { GOOGLE_CALENDAR_NAMESPACE, SECRET } from './constants';
import { resolveDetailLevel } from './mapping';
import { currentProjectId, projectQuery } from './project';
import { ifMatch } from './versioning';

export const CONFIG_SEARCH = `code=${GOOGLE_CALENDAR_NAMESPACE}|calendar-settings`;
const LEVEL_URL = `${GOOGLE_CALENDAR_NAMESPACE}/project-detail-level`;

/**
 * The project switch `GOOGLE_CALENDAR_ALLOW_EVENT_DETAILS` as the stored ceiling. Off keeps every
 * mirror Busy; on lets each practitioner choose busy-only, initials or full.
 * @param value - The secret or parameter value, `true` or `false`.
 * @returns The ceiling, or undefined when the value is absent.
 */
export function ceilingFromAllowEventDetails(value: string | undefined): EventDetailLevel | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`${SECRET.allowEventDetails} must be true or false`);
  }
  return normalized === 'true' ? 'full' : 'busy-only';
}

export async function readProjectCeiling(medplum: MedplumClient, fallback?: string): Promise<EventDetailLevel> {
  const matches = await medplum.searchResources('Basic', await projectQuery(medplum, `${CONFIG_SEARCH}&_count=2`), {
    cache: 'no-cache',
  });
  if (matches.length > 1) {
    throw new Error('Multiple calendar settings records require administrator repair');
  }
  const basic = matches[0];
  return resolveDetailLevel(basic ? (getExtensionValue(basic, LEVEL_URL) as string) : fallback);
}

/**
 * The ceiling every Bot applies. The project secret is the authority: the stored setting can only
 * lower the level, because a practitioner's own policy may let them edit that record.
 * @param medplum - The Medplum client.
 * @param secrets - The Bot's project secrets.
 * @returns The effective ceiling.
 */
export async function projectCeiling(medplum: MedplumClient, secrets: BotEvent['secrets']): Promise<EventDetailLevel> {
  const allow = secrets?.[SECRET.allowEventDetails];
  const fromSecret = ceilingFromAllowEventDetails(allow?.valueString ?? allow?.valueBoolean?.toString());
  return fromSecret === 'full' ? readProjectCeiling(medplum, 'full') : 'busy-only';
}

export async function writeProjectCeiling(medplum: MedplumClient, level: EventDetailLevel): Promise<void> {
  const resource: Basic = {
    resourceType: 'Basic',
    code: { coding: [{ system: GOOGLE_CALENDAR_NAMESPACE, code: 'calendar-settings' }] },
    identifier: [
      { system: `${GOOGLE_CALENDAR_NAMESPACE}/settings`, value: `Project/${await currentProjectId(medplum)}` },
    ],
    extension: [{ url: LEVEL_URL, valueCode: level }],
  };
  const matches = await medplum.searchResources('Basic', await projectQuery(medplum, `${CONFIG_SEARCH}&_count=2`));
  if (matches.length > 1) {
    throw new Error('Multiple calendar settings records require administrator repair');
  }
  const legacy = matches[0];
  const current =
    legacy ??
    (await medplum.createResourceIfNoneExist(
      resource,
      await projectQuery(medplum, {
        identifier: `${GOOGLE_CALENDAR_NAMESPACE}/settings|${resource.identifier?.[0].value}`,
      })
    ));
  await medplum.updateResource({ ...resource, id: current.id, meta: current.meta }, ifMatch(current));
}
