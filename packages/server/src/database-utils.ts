import { EventEmitter } from 'node:events';
import { Duplex, Readable, Writable } from 'node:stream';
import { Pool, PoolClient, QueryArrayResult } from 'pg';

export class MockPoolClient extends Duplex implements PoolClient {
  release(): void {}
  async connect(): Promise<void> {}
  async query(): Promise<QueryArrayResult<any>> {
    return {
      command: '',
      rowCount: null,
      oid: -1,
      fields: [],
      rows: [],
    };
  }
  copyFrom(_queryText: string): Writable {
    return new Writable();
  }
  copyTo(_queryText: string): Readable {
    return new Readable();
  }
  pauseDrain(): void {}
  resumeDrain(): void {}
  escapeIdentifier(_str: string): string {
    return '';
  }
  escapeLiteral(_str: string): string {
    return '';
  }
  getTypeParser(): any {
    return undefined;
  }
  setTypeParser(): void {}
}

export class MockPool extends EventEmitter implements Pool {
  totalCount = -1;
  idleCount = -1;
  waitingCount = -1;
  expiredCount = -1;
  ending = false;
  ended = false;
  options = {
    max: Number.POSITIVE_INFINITY,
    allowExitOnIdle: false,
    maxUses: Number.POSITIVE_INFINITY,
    maxLifetimeSeconds: Number.POSITIVE_INFINITY,
    idleTimeoutMillis: Number.POSITIVE_INFINITY,
  };
  async connect(): Promise<PoolClient> {
    return new MockPoolClient();
  }
  on(): this {
    return this;
  }
  async end(): Promise<void> {}
  async query(): Promise<QueryArrayResult<any>> {
    return {
      command: '',
      rowCount: null,
      oid: -1,
      fields: [],
      rows: [],
    };
  }
}
