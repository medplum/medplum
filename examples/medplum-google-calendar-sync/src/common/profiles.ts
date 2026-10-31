// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { CodeSystem, StructureDefinition, ValueSet } from '@medplum/fhirtypes';
import definitions from '../../profiles/definitions.json';
import { projectQuery } from './project';
import { ifMatch } from './lease';
export const PROFILE_ROOT = 'https://medplum.com/profiles/integrations/google-calendar';
export const PROFILES = {
  publicStatus: `${PROFILE_ROOT}/public-status`,
  connection: `${PROFILE_ROOT}/connection`,
  credential: `${PROFILE_ROOT}/credential`,
  settings: `${PROFILE_ROOT}/settings`,
  slot: `${PROFILE_ROOT}/imported-slot`,
  mirror: `${PROFILE_ROOT}/mirror`,
};
export const DEFINITIONS = definitions as (StructureDefinition | CodeSystem | ValueSet)[];
export async function installProfiles(medplum: MedplumClient): Promise<void> {
  for (const definition of DEFINITIONS) {
    const saved = await medplum.createResourceIfNoneExist(
      definition,
      await projectQuery(medplum, { url: definition.url as string })
    );
    await medplum.updateResource({ ...definition, id: saved.id, meta: saved.meta }, ifMatch(saved));
  }
}
