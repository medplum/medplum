// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SystemRepository } from '../repo';
import { getShardSystemRepo } from '../repo';
import { PLACEHOLDER_SHARD_ID } from '../sharding';

/**
 * Returns a logically project-routed system repository for test fixtures when
 * no related Project is available yet.
 *
 * Prefer repo.getSystemRepo() or getProjectSystemRepo(project) when possible.
 * @param shardId - The shard ID to use for the test system repository. Defaults to PLACEHOLDER_SHARD_ID.
 * @returns A system repository for the specified shard ID.
 */
export function getTestProjectSystemRepo(shardId = PLACEHOLDER_SHARD_ID): SystemRepository {
  return getShardSystemRepo(shardId);
}
