// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { getExtensionValue } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import type { EventDetailLevel } from './constants';
import { GOOGLE_CALENDAR_NAMESPACE } from './constants';
import { ifMatch } from './lease';
import { resolveDetailLevel } from './mapping';
import { PROFILES } from './profiles';
import { currentProjectId, projectQuery } from './project';

export const CONFIG_SEARCH = `code=${GOOGLE_CALENDAR_NAMESPACE}|calendar-settings`;
const LEVEL_URL = `${GOOGLE_CALENDAR_NAMESPACE}/project-detail-level`;

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

export async function writeProjectCeiling(medplum: MedplumClient, level: EventDetailLevel): Promise<void> {
  const resource: Basic = {
    resourceType: 'Basic',
    meta: { profile: [PROFILES.settings] },
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
  await medplum.updateResource(
    { ...resource, id: current.id, meta: { ...current.meta, profile: [PROFILES.settings] } },
    ifMatch(current)
  );
}
