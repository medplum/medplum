// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { PoolClient } from 'pg';
import { createRepositoryAccessTracker } from './access-tracker';
import type { RepositoryAccessTracker } from './access-tracker';

export type CallbackFrame = {
  pre: number;
  post: number;
};

export type TransactionContext = {
  depth: number;
  preCommitCallbacks: (() => Promise<void>)[];
  postCommitCallbacks: (() => Promise<void>)[];
  callbackStack: CallbackFrame[];
  accessTracker: RepositoryAccessTracker;
};

export type RepositoryConnectionContext = {
  conn?: PoolClient;
  ownsConnection: boolean;
  transaction?: TransactionContext;
};

export function createRepositoryConnectionContext(
  conn: PoolClient,
  ownsConnection: boolean
): RepositoryConnectionContext {
  return {
    conn,
    ownsConnection,
  };
}

export function createTransactionContext(): TransactionContext {
  return {
    depth: 0,
    preCommitCallbacks: [],
    postCommitCallbacks: [],
    callbackStack: [],
    accessTracker: createRepositoryAccessTracker(),
  };
}

export function getActiveTransactionContext(
  connectionContext: RepositoryConnectionContext | undefined
): TransactionContext | undefined {
  const transaction = connectionContext?.transaction;
  return transaction && transaction.depth > 0 ? transaction : undefined;
}
