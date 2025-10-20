// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, ProjectShard, Reference } from '@medplum/fhirtypes';
import type { PoolClient, PoolConfig } from 'pg';
import { Pool } from 'pg';
import type { Repository } from './fhir/repo';
import { getSystemRepo } from './fhir/repo';

export interface GlobalProject {
  id: string;
  shard?: ProjectShard[];
}

export interface ShardPoolClient extends PoolClient {
  shardId: string;
}

export class ShardPool extends Pool {
  readonly shardId: string;

  constructor(poolConfig: PoolConfig, shardId: string) {
    super(poolConfig);
    this.shardId = shardId;
  }

  connect(): Promise<ShardPoolClient>;
  connect(
    callback: (err: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void
  ): void;
  async connect(
    callback?: (err: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void
  ): Promise<void | ShardPoolClient> {
    if (callback) {
      super.connect(callback);
      return;
    }

    // const conn = (await super.connect()) as ShardPoolClient;
    // conn.shardId = this.shardId;
    // return conn;
    // eslint-disable-next-line consistent-return
    return super.connect().then((conn) => {
      (conn as ShardPoolClient).shardId = this.shardId;
      return conn;
    }) as Promise<ShardPoolClient>;
  }
}

export function getGlobalSystemRepo(): Repository {
  return getSystemRepo(undefined, 'global');
}

export function getProjectShardId(
  project: GlobalProject,
  defaultShardId: string = 'TODO-getProjectShardIdDefault'
): string {
  console.log('getProjectShardId', project.id, JSON.stringify(project.shard));
  return project.shard?.[0]?.id ?? defaultShardId;
}

export async function getProjectAndProjectShardId(
  projectReference: Reference<Project>
): Promise<{ project: WithId<Project>; projectShardId: string }> {
  const globalSystemRepo = getGlobalSystemRepo();
  const globalProject: GlobalProject = await globalSystemRepo.readReference<Project>(
    projectReference as Reference<Project>
  );

  const projectShardId = getProjectShardId(globalProject);
  if (projectShardId === 'global') {
    // The project is in the global shard; done
    return { project: globalProject as WithId<Project>, projectShardId };
  }

  const systemRepo = getSystemRepo(undefined, projectShardId);
  const project = await systemRepo.readReference<Project>(projectReference);
  return { project, projectShardId };
}
