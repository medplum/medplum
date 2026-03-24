// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Pool, PoolClient } from 'pg';

export interface ShardPoolClient extends PoolClient {
  shardId: string;
}

export interface ShardPool extends Pool {
  shardId: string;

  connect(): Promise<ShardPoolClient>;
}
