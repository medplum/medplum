// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient, PoolConfig } from 'pg';
import { Pool } from 'pg';
import type { ShardPool, ShardPoolClient } from './sharding-types';

export class DefaultShardPool extends Pool implements ShardPool {
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
