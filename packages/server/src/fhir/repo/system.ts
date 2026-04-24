// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import type { PoolClient } from 'pg';
import { GLOBAL_SHARD_ID } from '../sharding';
import type { Repository, RepositoryContext } from '../repo';
import type { RepositoryConnectionContext } from './transaction-context';

export type SystemRepository = Repository;
export type SystemRepositoryContextDefaults = Pick<RepositoryContext, 'skipBackgroundJobs'>;

export type RepositoryConstructor<TRepository extends Repository = Repository> = new (
  context: RepositoryContext,
  conn?: PoolClient,
  connectionContext?: RepositoryConnectionContext
) => TRepository;

export function createSystemRepository<TRepository extends Repository>(
  RepositoryCtor: RepositoryConstructor<TRepository>,
  shardId: string,
  conn?: PoolClient,
  contextDefaults?: SystemRepositoryContextDefaults,
  connectionContext?: RepositoryConnectionContext
): TRepository {
  return new RepositoryCtor(
    {
      ...contextDefaults,
      shardId,
      superAdmin: true,
      strictMode: true,
      extendedMode: true,
      author: {
        reference: 'system',
      },
    },
    conn,
    connectionContext
  );
}

export function getGlobalSystemRepo<TRepository extends Repository>(
  RepositoryCtor: RepositoryConstructor<TRepository>,
  client?: PoolClient,
  contextDefaults?: SystemRepositoryContextDefaults
): TRepository {
  return createSystemRepository(RepositoryCtor, GLOBAL_SHARD_ID, client, contextDefaults);
}

export function getShardSystemRepo<TRepository extends Repository>(
  RepositoryCtor: RepositoryConstructor<TRepository>,
  shardId: string,
  client?: PoolClient,
  contextDefaults?: SystemRepositoryContextDefaults
): TRepository {
  return createSystemRepository(RepositoryCtor, shardId, client, contextDefaults);
}

export async function getProjectSystemRepo<TRepository extends Repository>(
  RepositoryCtor: RepositoryConstructor<TRepository>,
  _projectId: string | Reference<Project> | WithId<Project>
): Promise<TRepository> {
  return getGlobalSystemRepo(RepositoryCtor);
}
