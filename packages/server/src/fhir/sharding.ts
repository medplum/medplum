// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import { getGlobalSystemRepo } from './repo';

/**
 * The shard ID for the global database.
 * Also used when sharding is not enabled.
 */
export const GLOBAL_SHARD_ID = 'global';

/**
 * Transitory shard ID to use during the future-proofing phase when it is clear
 * how an actual shard ID should be determined but that logic has not yet been implemented.
 * Allows the rest of the sharding logic to be implemented and tested before
 * sharding is fully functional.
 */
export const PLACEHOLDER_SHARD_ID = 'placeholder';

/**
 * Transitory shard ID to use during the future-proofing phase when support for project-based
 * sharding still needs to be determined. Allows the rest of the sharding logic to be implemented
 * and tested before sharding is fully functional.
 */
export const TODO_SHARD_ID = 'todo';

/**
 * Future-proofing function for reading a Project by reference or ID during request authentication
 * or other scenarios where an AuthenticatedRequestContext has not yet been established.
 *
 * @param projectOrReferenceOrId - A Project ID, Reference, or undefined.
 * @returns A promise that resolves to the Project.
 */
export async function getProjectByReferenceOrId(
  projectOrReferenceOrId: string | Reference<Project> | undefined
): Promise<WithId<Project>> {
  let project: WithId<Project>;
  if (typeof projectOrReferenceOrId === 'string' || projectOrReferenceOrId === undefined) {
    // cast undefined to string to trigger readResource to throw not found
    project = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId as string);
  } else {
    project = await getGlobalSystemRepo().readReference<Project>(projectOrReferenceOrId);
  }
  return project;
}
