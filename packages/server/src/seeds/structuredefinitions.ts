// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { rebuildBaseDefinitions } from '../fhir/operations/rebuild-base-definitions';
import type { Repository } from '../fhir/repo';

/**
 * Creates all StructureDefinition resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4StructureDefinitions(systemRepo: Repository): Promise<void> {
  await rebuildBaseDefinitions(systemRepo, ['StructureDefinition', 'OperationDefinition']);
}
