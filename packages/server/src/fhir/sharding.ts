// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { protectedResourceTypes } from '@medplum/core';

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

/** Resource types that can only be created by the system and only on the global shard */
export const GlobalOnlyResourceTypes = new Set(protectedResourceTypes);

/** Resource types that must be discoverable outside the context of a Project */
export const GlobalResourceTypes = new Set([
  // Source of truth for project shard ID, but special handling is already taken for creating a shell Project in the global shard
  // That should probably be revisited so that Project is handled the same as other synced resource types
  'Project',
  'ClientApplication', // Read by ID during bearer token validation
  'ProjectMembership', // Lookup by user during login
  'SmartAppLaunch', // Read by ID during login
  'User', // Read by email/externalId during auth
  'UserSecurityRequest', // Read by ID during user security request, e.g. password reset
  'Agent', // TBD; may not be needed on
]);
