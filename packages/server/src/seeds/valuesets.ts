// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { rebuildBaseDefinitions } from '../fhir/operations/rebuild-base-definitions';
import type { Repository } from '../fhir/repo';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4ValueSets(systemRepo: Repository): Promise<void> {
  await rebuildBaseDefinitions(systemRepo, ['CodeSystem', 'ValueSet']);
}
